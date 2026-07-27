-- Atomic provider-owned availability writes and privacy-safe public slot lookup.

CREATE OR REPLACE FUNCTION public.replace_provider_availability_rules(
  _timezone text,
  _rules jsonb
)
RETURNS SETOF public.provider_availability_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rule jsonb;
  v_weekday smallint;
  v_starts time;
  v_ends time;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.provider_calendar_assert_timezone(_timezone);
  IF jsonb_typeof(_rules) <> 'array' OR jsonb_array_length(_rules) > 21 THEN
    RAISE EXCEPTION 'invalid_availability_rules' USING ERRCODE = '22023';
  END IF;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(_rules)
  LOOP
    v_weekday := (v_rule->>'weekday')::smallint;
    v_starts := (v_rule->>'starts_at')::time;
    v_ends := (v_rule->>'ends_at')::time;
    IF v_weekday NOT BETWEEN 1 AND 7
       OR v_starts >= v_ends
       OR EXTRACT(minute FROM v_starts) <> 0
       OR EXTRACT(minute FROM v_ends) <> 0 THEN
      RAISE EXCEPTION 'invalid_availability_rule' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.provider_availability_rules
  WHERE provider_user_id = v_uid;

  INSERT INTO public.provider_availability_rules(
    provider_user_id, weekday, starts_at, ends_at, timezone
  )
  SELECT
    v_uid,
    (r->>'weekday')::smallint,
    (r->>'starts_at')::time,
    (r->>'ends_at')::time,
    _timezone
  FROM jsonb_array_elements(_rules) AS r;

  RETURN QUERY
  SELECT *
  FROM public.provider_availability_rules
  WHERE provider_user_id = v_uid
  ORDER BY weekday, starts_at;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_provider_availability_rules(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_provider_availability_rules(text, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_provider_time_off(
  _starts_at timestamptz,
  _ends_at timestamptz
)
RETURNS public.provider_calendar_blocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_block public.provider_calendar_blocks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _starts_at >= _ends_at OR _ends_at <= now() THEN
    RAISE EXCEPTION 'invalid_time_off' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.provider_calendar_blocks(
    provider_user_id, source, starts_at, ends_at
  )
  VALUES (v_uid, 'time_off', _starts_at, _ends_at)
  RETURNING * INTO v_block;
  RETURN v_block;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_provider_time_off(_block_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  DELETE FROM public.provider_calendar_blocks
  WHERE id = _block_id
    AND provider_user_id = v_uid
    AND source IN ('manual', 'time_off');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_off_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_provider_time_off(timestamptz, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_provider_time_off(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_provider_time_off(timestamptz, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_provider_time_off(uuid)
  TO authenticated, service_role;

-- Preserve the established return signature used by the public provider page.
-- Only availability is returned; no block or external-calendar metadata leaks.
CREATE OR REPLACE FUNCTION public.list_provider_bookable_slots_v1(
  _slug text,
  _from date,
  _to date
)
RETURNS TABLE(slot_date date, slot_hour smallint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_from date;
  v_to date;
BEGIN
  SELECT p.user_id INTO v_user_id
  FROM public.provider_profiles p
  WHERE p.provider_slug = _slug
    AND p.is_public = true
    AND p.status = 'active'
    AND p.visibility = 'public'
    AND coalesce(p.payout_frozen, false) = false
  LIMIT 1;

  IF v_user_id IS NULL THEN RETURN; END IF;
  v_from := GREATEST(_from, current_date);
  v_to := LEAST(_to, current_date + 84);
  IF v_from > v_to THEN RETURN; END IF;

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(v_from, v_to, interval '1 day') d
  ),
  candidates AS (
    SELECT
      d.day,
      h::smallint AS hour,
      ((d.day + make_time(h, 0, 0)) AT TIME ZONE r.timezone) AS starts_at,
      ((d.day + make_time(h + 1, 0, 0)) AT TIME ZONE r.timezone) AS ends_at
    FROM days d
    JOIN public.provider_availability_rules r
      ON r.provider_user_id = v_user_id
     AND r.is_active
     AND EXTRACT(isodow FROM d.day)::smallint = r.weekday
     AND d.day >= r.effective_from
     AND (r.effective_until IS NULL OR d.day <= r.effective_until)
    CROSS JOIN LATERAL generate_series(
      EXTRACT(hour FROM r.starts_at)::int,
      EXTRACT(hour FROM r.ends_at)::int - 1
    ) h
  )
  SELECT c.day, c.hour
  FROM candidates c
  WHERE c.starts_at > now() + interval '1 hour'
    AND NOT EXISTS (
      SELECT 1
      FROM public.provider_calendar_blocks b
      WHERE b.provider_user_id = v_user_id
        AND (b.expires_at IS NULL OR b.expires_at > now())
        AND tstzrange(b.starts_at, b.ends_at, '[)')
            && tstzrange(c.starts_at, c.ends_at, '[)')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_slot_locks l
      WHERE l.provider_user_id = v_user_id
        AND l.status IN ('held', 'confirmed')
        AND (l.status <> 'held' OR l.hold_expires_at > now())
        AND tstzrange(l.starts_at, l.ends_at, '[)')
            && tstzrange(c.starts_at, c.ends_at, '[)')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.provider_id = v_user_id::text
        AND b.booking_date = c.day
        AND b.slot = lpad(c.hour::text, 2, '0') || ':00'
        AND b.status::text NOT IN ('cancelled', 'declined')
    )
  ORDER BY c.day, c.hour;
END;
$$;

REVOKE ALL ON FUNCTION public.list_provider_bookable_slots_v1(text, date, date)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_provider_bookable_slots_v1(text, date, date)
  TO anon, authenticated, service_role;
