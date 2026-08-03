CREATE OR REPLACE FUNCTION public.get_provider_live_status_v1(
  _provider_user_ids uuid[] DEFAULT NULL,
  _slugs text[] DEFAULT NULL
)
RETURNS TABLE(
  provider_user_id uuid,
  provider_slug text,
  status text,
  active_until timestamptz,
  next_available_at timestamptz,
  timezone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
WITH targets AS (
  SELECT
    p.user_id,
    p.provider_slug::text AS slug,
    coalesce(p.is_bookable, true) AS bookable,
    pr.provider_id AS legacy_provider_id
  FROM public.provider_profiles p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.is_public = true
    AND p.status = 'active'
    AND p.visibility = 'public'
    AND (
      (_provider_user_ids IS NOT NULL AND p.user_id = ANY(_provider_user_ids))
      OR (_slugs IS NOT NULL AND lower(p.provider_slug::text) IN (SELECT lower(s) FROM unnest(_slugs) s))
    )
),
tz AS (
  SELECT
    t.user_id,
    coalesce(
      (SELECT r.timezone FROM public.provider_availability_rules r
        WHERE r.provider_user_id = t.user_id AND r.is_active LIMIT 1),
      'Europe/Copenhagen'
    ) AS tzname
  FROM targets t
),
vac AS (
  SELECT b.provider_user_id AS uid, max(b.ends_at) AS ends_at
  FROM public.provider_calendar_blocks b
  JOIN targets t ON t.user_id = b.provider_user_id
  WHERE b.block_type = 'vacation' AND b.starts_at <= now() AND b.ends_at > now()
  GROUP BY b.provider_user_id
),
sick AS (
  SELECT b.provider_user_id AS uid, max(b.ends_at) AS ends_at
  FROM public.provider_calendar_blocks b
  JOIN targets t ON t.user_id = b.provider_user_id
  WHERE b.block_type = 'sick_leave' AND b.starts_at <= now() AND b.ends_at > now()
  GROUP BY b.provider_user_id
),
otherblock AS (
  SELECT b.provider_user_id AS uid, max(b.ends_at) AS ends_at
  FROM public.provider_calendar_blocks b
  JOIN targets t ON t.user_id = b.provider_user_id
  WHERE b.block_type NOT IN ('vacation', 'sick_leave')
    AND b.starts_at <= now() AND b.ends_at > now()
  GROUP BY b.provider_user_id
),
busy AS (
  SELECT
    t.user_id AS uid,
    max(
      ((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen'))
      + make_interval(mins => (coalesce(bk.hours, 1) * 60)::int)
    ) AS ends_at
  FROM targets t
  JOIN public.bookings bk ON bk.provider_id = t.legacy_provider_id
  WHERE t.legacy_provider_id IS NOT NULL
    AND bk.lifecycle_state IN ('accepted','travelling','arrived','work_started','paused','resumed')
    AND bk.booking_date BETWEEN (current_date - 1) AND (current_date + 1)
    AND ((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen')) <= now()
    AND (((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen'))
         + make_interval(mins => (coalesce(bk.hours, 1) * 60)::int)) > now()
  GROUP BY t.user_id
),
inwork AS (
  SELECT t.user_id AS uid, max((((now() AT TIME ZONE z.tzname)::date) + r.local_end_time) AT TIME ZONE z.tzname) AS window_end
  FROM targets t
  JOIN tz z ON z.user_id = t.user_id
  JOIN public.provider_availability_rules r
    ON r.provider_user_id = t.user_id AND r.is_active
  WHERE (r.weekday % 7) = extract(dow FROM (now() AT TIME ZONE z.tzname))::int
    AND (now() AT TIME ZONE z.tzname)::time >= r.local_start_time
    AND (now() AT TIME ZONE z.tzname)::time < r.local_end_time
  GROUP BY t.user_id
),
cands AS (
  SELECT
    t.user_id AS uid,
    greatest(
      ((d.day::date) + r.local_start_time) AT TIME ZONE z.tzname,
      date_trunc('hour', now()) + interval '1 hour'
    ) AS start_at,
    ((d.day::date) + r.local_end_time) AT TIME ZONE z.tzname AS end_at,
    t.legacy_provider_id
  FROM targets t
  JOIN tz z ON z.user_id = t.user_id
  CROSS JOIN LATERAL generate_series(
    (now() AT TIME ZONE z.tzname)::date,
    (now() AT TIME ZONE z.tzname)::date + 30,
    interval '1 day'
  ) AS d(day)
  JOIN public.provider_availability_rules r
    ON r.provider_user_id = t.user_id AND r.is_active
   AND (r.weekday % 7) = extract(dow FROM d.day)::int
),
freeslot AS (
  SELECT c.uid, min(c.start_at) AS next_at
  FROM cands c
  WHERE c.start_at < c.end_at
    AND NOT EXISTS (
      SELECT 1 FROM public.provider_calendar_blocks b
      WHERE b.provider_user_id = c.uid
        AND b.starts_at <= c.start_at AND b.ends_at > c.start_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings bk
      WHERE c.legacy_provider_id IS NOT NULL
        AND bk.provider_id = c.legacy_provider_id
        AND bk.lifecycle_state IN ('accepted','travelling','arrived','work_started','paused','resumed')
        AND ((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen')) <= c.start_at
        AND (((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen'))
             + make_interval(mins => (coalesce(bk.hours, 1) * 60)::int)) > c.start_at
    )
  GROUP BY c.uid
)
SELECT
  t.user_id,
  t.slug,
  CASE
    WHEN v.ends_at IS NOT NULL THEN 'vacation'
    WHEN NOT t.bookable OR s.ends_at IS NOT NULL THEN 'unavailable'
    WHEN bu.ends_at IS NOT NULL THEN 'busy'
    WHEN w.window_end IS NOT NULL AND ob.ends_at IS NULL THEN 'available'
    ELSE 'off_hours'
  END AS status,
  CASE
    WHEN v.ends_at IS NOT NULL THEN v.ends_at
    WHEN s.ends_at IS NOT NULL THEN s.ends_at
    WHEN bu.ends_at IS NOT NULL THEN bu.ends_at
    WHEN ob.ends_at IS NOT NULL AND w.window_end IS NOT NULL THEN ob.ends_at
    ELSE NULL
  END AS active_until,
  CASE
    WHEN v.ends_at IS NOT NULL THEN greatest(v.ends_at, coalesce(f.next_at, v.ends_at))
    WHEN w.window_end IS NOT NULL AND ob.ends_at IS NULL AND bu.ends_at IS NULL
         AND s.ends_at IS NULL AND t.bookable THEN now()
    ELSE f.next_at
  END AS next_available_at,
  z.tzname
FROM targets t
JOIN tz z ON z.user_id = t.user_id
LEFT JOIN vac v ON v.uid = t.user_id
LEFT JOIN sick s ON s.uid = t.user_id
LEFT JOIN otherblock ob ON ob.uid = t.user_id
LEFT JOIN busy bu ON bu.uid = t.user_id
LEFT JOIN inwork w ON w.uid = t.user_id
LEFT JOIN freeslot f ON f.uid = t.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_provider_live_status_v1(uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_live_status_v1(uuid[], text[]) TO anon, authenticated, service_role;