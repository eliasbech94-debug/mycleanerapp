-- ============================================================
-- Provider Live Status: presence, travelling, transition log, analytics
-- ============================================================

-- 1. Presence -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_presence (
  provider_user_id uuid PRIMARY KEY,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  last_app_seen_at timestamptz NOT NULL DEFAULT now(),
  last_source text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_presence TO authenticated;
GRANT ALL ON public.provider_presence TO service_role;

ALTER TABLE public.provider_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers read own presence" ON public.provider_presence;
CREATE POLICY "Providers read own presence"
  ON public.provider_presence FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid());

DROP POLICY IF EXISTS "Staff read presence" ON public.provider_presence;
CREATE POLICY "Staff read presence"
  ON public.provider_presence FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'support')
  );

DROP TRIGGER IF EXISTS trg_provider_presence_touch ON public.provider_presence;
CREATE TRIGGER trg_provider_presence_touch
  BEFORE UPDATE ON public.provider_presence
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 2. Status event history ------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  source text NOT NULL DEFAULT 'resolver',
  booking_id uuid,
  presence_state text,
  country_code text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_status_events_provider_time
  ON public.provider_status_events (provider_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_status_events_time
  ON public.provider_status_events (created_at DESC);

GRANT SELECT ON public.provider_status_events TO authenticated;
GRANT ALL ON public.provider_status_events TO service_role;

ALTER TABLE public.provider_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read status events" ON public.provider_status_events;
CREATE POLICY "Staff read status events"
  ON public.provider_status_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'support')
  );

-- 3. Core resolver (single source of truth, internal) ---------
CREATE OR REPLACE FUNCTION public.provider_live_status_rows_v1(
  _provider_user_ids uuid[] DEFAULT NULL,
  _slugs text[] DEFAULT NULL,
  _public_only boolean DEFAULT true
)
RETURNS TABLE(
  provider_user_id uuid,
  provider_slug text,
  status text,
  active_until timestamptz,
  next_available_at timestamptz,
  timezone text,
  active_booking_id uuid,
  country_code text,
  last_active_at timestamptz
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
    p.base_country_code,
    pr.provider_id AS legacy_provider_id
  FROM public.provider_profiles p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.status = 'active'
    AND (_public_only IS FALSE OR (p.is_public = true AND p.visibility = 'public'))
    AND (
      (_provider_user_ids IS NULL AND _slugs IS NULL AND _public_only IS FALSE)
      OR (_provider_user_ids IS NOT NULL AND p.user_id = ANY(_provider_user_ids))
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
active_bookings AS (
  SELECT
    t.user_id AS uid,
    bk.id AS booking_id,
    bk.lifecycle_state::text AS lifecycle_state,
    ((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen'))
      + make_interval(mins => (coalesce(bk.hours, 1) * 60)::int) AS ends_at
  FROM targets t
  JOIN public.bookings bk ON bk.provider_id = t.legacy_provider_id
  WHERE t.legacy_provider_id IS NOT NULL
    AND bk.lifecycle_state IN ('accepted','travelling','arrived','work_started','paused','resumed')
    AND bk.booking_date BETWEEN (current_date - 1) AND (current_date + 1)
    AND ((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen'))
        <= now() + interval '2 hours'
    AND (((bk.booking_date + bk.slot::time) AT TIME ZONE coalesce(bk.timezone, 'Europe/Copenhagen'))
         + make_interval(mins => (coalesce(bk.hours, 1) * 60)::int)) > now()
),
travel AS (
  SELECT DISTINCT ON (a.uid) a.uid, a.booking_id, a.ends_at
  FROM active_bookings a
  WHERE a.lifecycle_state = 'travelling'
  ORDER BY a.uid, a.ends_at
),
busy AS (
  SELECT DISTINCT ON (a.uid) a.uid, a.booking_id, a.ends_at
  FROM active_bookings a
  WHERE a.lifecycle_state <> 'travelling'
    AND ((a.ends_at - make_interval(mins => 0)) IS NOT NULL)
    AND a.ends_at > now()
    AND EXISTS (
      SELECT 1 FROM public.bookings bk2
      WHERE bk2.id = a.booking_id
        AND ((bk2.booking_date + bk2.slot::time) AT TIME ZONE coalesce(bk2.timezone, 'Europe/Copenhagen')) <= now()
    )
  ORDER BY a.uid, a.ends_at
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
    WHEN tr.booking_id IS NOT NULL THEN 'travelling'
    WHEN bu.ends_at IS NOT NULL THEN 'busy'
    WHEN w.window_end IS NOT NULL AND ob.ends_at IS NULL THEN 'available'
    ELSE 'off_hours'
  END AS status,
  CASE
    WHEN v.ends_at IS NOT NULL THEN v.ends_at
    WHEN s.ends_at IS NOT NULL THEN s.ends_at
    WHEN tr.ends_at IS NOT NULL THEN tr.ends_at
    WHEN bu.ends_at IS NOT NULL THEN bu.ends_at
    WHEN ob.ends_at IS NOT NULL AND w.window_end IS NOT NULL THEN ob.ends_at
    ELSE NULL
  END AS active_until,
  CASE
    WHEN v.ends_at IS NOT NULL THEN greatest(v.ends_at, coalesce(f.next_at, v.ends_at))
    WHEN w.window_end IS NOT NULL AND ob.ends_at IS NULL AND bu.ends_at IS NULL AND tr.booking_id IS NULL
         AND s.ends_at IS NULL AND t.bookable THEN now()
    ELSE f.next_at
  END AS next_available_at,
  z.tzname,
  coalesce(tr.booking_id, bu.booking_id) AS active_booking_id,
  t.base_country_code,
  pp.last_app_seen_at
FROM targets t
JOIN tz z ON z.user_id = t.user_id
LEFT JOIN vac v ON v.uid = t.user_id
LEFT JOIN sick s ON s.uid = t.user_id
LEFT JOIN otherblock ob ON ob.uid = t.user_id
LEFT JOIN travel tr ON tr.uid = t.user_id
LEFT JOIN busy bu ON bu.uid = t.user_id
LEFT JOIN inwork w ON w.uid = t.user_id
LEFT JOIN freeslot f ON f.uid = t.user_id
LEFT JOIN public.provider_presence pp ON pp.provider_user_id = t.user_id;
$$;

REVOKE ALL ON FUNCTION public.provider_live_status_rows_v1(uuid[], text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_live_status_rows_v1(uuid[], text[], boolean) TO service_role;

-- 4. Public resolver (minimum fields only) --------------------
DROP FUNCTION IF EXISTS public.get_provider_live_status_v1(uuid[], text[]);
CREATE FUNCTION public.get_provider_live_status_v1(
  _provider_user_ids uuid[] DEFAULT NULL,
  _slugs text[] DEFAULT NULL
)
RETURNS TABLE(
  provider_user_id uuid,
  provider_slug text,
  status text,
  active_until timestamptz,
  next_available_at timestamptz,
  timezone text,
  presence_state text,
  presence_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    r.provider_user_id,
    r.provider_slug,
    r.status,
    r.active_until,
    r.next_available_at,
    r.timezone,
    CASE
      WHEN r.last_active_at IS NULL THEN 'unknown'
      WHEN r.last_active_at > now() - interval '3 minutes' THEN 'online'
      WHEN r.last_active_at > now() - interval '15 minutes' THEN 'recent'
      WHEN r.last_active_at > now() - interval '60 minutes' THEN 'idle'
      ELSE 'offline'
    END AS presence_state,
    CASE
      WHEN r.last_active_at IS NULL THEN NULL
      WHEN r.last_active_at <= now() - interval '60 minutes' THEN NULL
      ELSE floor(extract(epoch FROM (now() - r.last_active_at)) / 60)::int
    END AS presence_minutes
  FROM public.provider_live_status_rows_v1(_provider_user_ids, _slugs, true) r;
$$;

REVOKE ALL ON FUNCTION public.get_provider_live_status_v1(uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_live_status_v1(uuid[], text[]) TO anon, authenticated, service_role;

-- 5. Throttled heartbeat --------------------------------------
CREATE OR REPLACE FUNCTION public.provider_presence_heartbeat_v1(_source text DEFAULT 'app')
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _uid uuid := auth.uid();
  _src text := coalesce(nullif(left(_source, 40), ''), 'app');
  _row public.provider_presence;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_profiles p WHERE p.user_id = _uid) THEN
    RAISE EXCEPTION 'not_a_provider' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.provider_presence AS pp (provider_user_id, last_active_at, last_app_seen_at, last_source)
  VALUES (_uid, now(), now(), _src)
  ON CONFLICT (provider_user_id) DO UPDATE
    SET last_active_at = now(),
        last_app_seen_at = now(),
        last_source = EXCLUDED.last_source
    WHERE pp.last_app_seen_at < now() - interval '60 seconds'
  RETURNING * INTO _row;

  IF _row.provider_user_id IS NULL THEN
    SELECT * INTO _row FROM public.provider_presence WHERE provider_user_id = _uid;
    RETURN jsonb_build_object('throttled', true, 'last_active_at', _row.last_active_at);
  END IF;

  RETURN jsonb_build_object('throttled', false, 'last_active_at', _row.last_active_at);
END;
$$;

REVOKE ALL ON FUNCTION public.provider_presence_heartbeat_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_presence_heartbeat_v1(text) TO authenticated, service_role;

-- 6. Transition-aware event logging ---------------------------
CREATE OR REPLACE FUNCTION public.sync_provider_status_events_v1(
  _provider_user_ids uuid[] DEFAULT NULL,
  _source text DEFAULT 'resolver'
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _inserted integer := 0;
BEGIN
  WITH resolved AS (
    SELECT * FROM public.provider_live_status_rows_v1(_provider_user_ids, NULL, false)
  ),
  last_event AS (
    SELECT DISTINCT ON (e.provider_user_id) e.provider_user_id, e.new_status
    FROM public.provider_status_events e
    JOIN resolved r ON r.provider_user_id = e.provider_user_id
    ORDER BY e.provider_user_id, e.created_at DESC
  ),
  ins AS (
    INSERT INTO public.provider_status_events
      (provider_user_id, previous_status, new_status, source, booking_id, presence_state, country_code)
    SELECT
      r.provider_user_id,
      le.new_status,
      r.status,
      coalesce(nullif(left(_source, 40), ''), 'resolver'),
      r.active_booking_id,
      CASE
        WHEN r.last_active_at IS NULL THEN 'unknown'
        WHEN r.last_active_at > now() - interval '3 minutes' THEN 'online'
        WHEN r.last_active_at > now() - interval '15 minutes' THEN 'recent'
        WHEN r.last_active_at > now() - interval '60 minutes' THEN 'idle'
        ELSE 'offline'
      END,
      r.country_code
    FROM resolved r
    LEFT JOIN last_event le ON le.provider_user_id = r.provider_user_id
    WHERE le.new_status IS DISTINCT FROM r.status
    RETURNING 1
  )
  SELECT count(*)::int INTO _inserted FROM ins;
  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_provider_status_events_v1(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_provider_status_events_v1(uuid[], text) TO service_role;

-- Triggers: only on authoritative lifecycle/calendar changes
CREATE OR REPLACE FUNCTION public.trg_sync_status_events_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _uid uuid;
BEGIN
  SELECT pr.id INTO _uid FROM public.profiles pr WHERE pr.provider_id = NEW.provider_id LIMIT 1;
  IF _uid IS NOT NULL THEN
    PERFORM public.sync_provider_status_events_v1(ARRAY[_uid], 'booking_lifecycle');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_status_events ON public.bookings;
CREATE TRIGGER trg_bookings_status_events
  AFTER UPDATE OF lifecycle_state ON public.bookings
  FOR EACH ROW
  WHEN (OLD.lifecycle_state IS DISTINCT FROM NEW.lifecycle_state)
  EXECUTE FUNCTION public.trg_sync_status_events_booking();

CREATE OR REPLACE FUNCTION public.trg_sync_status_events_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _uid uuid := coalesce(NEW.provider_user_id, OLD.provider_user_id);
BEGIN
  IF _uid IS NOT NULL THEN
    PERFORM public.sync_provider_status_events_v1(ARRAY[_uid], 'calendar');
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_blocks_status_events ON public.provider_calendar_blocks;
CREATE TRIGGER trg_calendar_blocks_status_events
  AFTER INSERT OR UPDATE OR DELETE ON public.provider_calendar_blocks
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_status_events_calendar();

-- 7. Admin analytics -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_live_status_analytics_v1(
  _from timestamptz DEFAULT (now() - interval '7 days'),
  _to timestamptz DEFAULT now(),
  _country text DEFAULT NULL,
  _city text DEFAULT NULL,
  _provider_user_id uuid DEFAULT NULL,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'support')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Refresh the live snapshot so "current" counts are accurate.
  PERFORM public.sync_provider_status_events_v1(NULL, 'admin_refresh');

  WITH live AS (
    SELECT * FROM public.provider_live_status_rows_v1(NULL, NULL, false)
    WHERE (_country IS NULL OR country_code = _country)
      AND (_provider_user_id IS NULL OR provider_user_id = _provider_user_id)
      AND (_status IS NULL OR status = _status)
  ),
  ev AS (
    SELECT e.*,
      lead(e.created_at) OVER (PARTITION BY e.provider_user_id ORDER BY e.created_at) AS next_at
    FROM public.provider_status_events e
    WHERE e.created_at >= _from AND e.created_at <= _to
      AND (_country IS NULL OR e.country_code = _country)
      AND (_city IS NULL OR e.city = _city)
      AND (_provider_user_id IS NULL OR e.provider_user_id = _provider_user_id)
      AND (_status IS NULL OR e.new_status = _status)
  ),
  durations AS (
    SELECT ev.*, extract(epoch FROM (coalesce(ev.next_at, least(now(), _to)) - ev.created_at)) / 60 AS minutes
    FROM ev
  ),
  accepted AS (
    SELECT b.id, b.created_at,
      (SELECT e.new_status FROM public.provider_status_events e
        WHERE e.provider_user_id = (SELECT pr.id FROM public.profiles pr WHERE pr.provider_id = b.provider_id LIMIT 1)
          AND e.created_at <= coalesce(b.accepted_at, b.updated_at)
        ORDER BY e.created_at DESC LIMIT 1) AS status_at_accept,
      (SELECT e.presence_state FROM public.provider_status_events e
        WHERE e.provider_user_id = (SELECT pr.id FROM public.profiles pr WHERE pr.provider_id = b.provider_id LIMIT 1)
          AND e.created_at <= coalesce(b.accepted_at, b.updated_at)
        ORDER BY e.created_at DESC LIMIT 1) AS presence_at_accept,
      extract(epoch FROM (coalesce(b.accepted_at, b.updated_at) - b.created_at)) / 60 AS response_minutes
    FROM public.bookings b
    WHERE b.created_at >= _from AND b.created_at <= _to
      AND b.lifecycle_state NOT IN ('pending','declined','cancelled')
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', _from, 'to', _to),
    'current', (
      SELECT jsonb_build_object(
        'available', count(*) FILTER (WHERE status = 'available'),
        'busy', count(*) FILTER (WHERE status = 'busy'),
        'travelling', count(*) FILTER (WHERE status = 'travelling'),
        'off_hours', count(*) FILTER (WHERE status = 'off_hours'),
        'unavailable', count(*) FILTER (WHERE status IN ('unavailable','vacation')),
        'online_now', count(*) FILTER (WHERE last_active_at > now() - interval '3 minutes'),
        'total', count(*)
      ) FROM live
    ),
    'median_status_duration_minutes', (
      SELECT round(coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes), 0)::numeric, 1) FROM durations
    ),
    'avg_available_minutes_per_provider', (
      SELECT round(coalesce(avg(total), 0)::numeric, 1) FROM (
        SELECT provider_user_id, sum(minutes) AS total FROM durations
        WHERE new_status = 'available' GROUP BY provider_user_id
      ) s
    ),
    'pct_accepted_while_available', (
      SELECT CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE status_at_accept = 'available') / count(*), 1) END
      FROM accepted
    ),
    'avg_response_minutes_while_online', (
      SELECT round(coalesce(avg(response_minutes), 0)::numeric, 1)
      FROM accepted WHERE presence_at_accept = 'online' AND response_minutes >= 0
    ),
    'transitions', (SELECT count(*) FROM ev),
    'by_hour', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'hour'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'hour', lpad(extract(hour FROM created_at)::text, 2, '0'),
          'available', count(*) FILTER (WHERE new_status = 'available'),
          'busy', count(*) FILTER (WHERE new_status = 'busy'),
          'travelling', count(*) FILTER (WHERE new_status = 'travelling'),
          'off_hours', count(*) FILTER (WHERE new_status = 'off_hours'),
          'unavailable', count(*) FILTER (WHERE new_status IN ('unavailable','vacation'))
        ) AS x
        FROM ev GROUP BY extract(hour FROM created_at)
      ) h
    ),
    'by_country', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'country'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'country', coalesce(country_code, 'ukendt'),
          'events', count(*),
          'available', count(*) FILTER (WHERE new_status = 'available'),
          'busy', count(*) FILTER (WHERE new_status IN ('busy','travelling'))
        ) AS x
        FROM ev GROUP BY country_code
      ) c
    ),
    'by_city', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'city'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('city', city, 'events', count(*)) AS x
        FROM ev WHERE city IS NOT NULL GROUP BY city
      ) c
    ),
    'recent_events', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', id, 'provider_user_id', provider_user_id,
          'previous_status', previous_status, 'new_status', new_status,
          'source', source, 'booking_id', booking_id,
          'presence_state', presence_state, 'country_code', country_code,
          'created_at', created_at
        ) AS x
        FROM ev ORDER BY created_at DESC LIMIT 50
      ) r
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_live_status_analytics_v1(timestamptz, timestamptz, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_live_status_analytics_v1(timestamptz, timestamptz, text, text, uuid, text) TO authenticated, service_role;