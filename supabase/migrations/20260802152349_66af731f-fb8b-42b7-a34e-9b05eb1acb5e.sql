-- ============================================================
-- MyCleaner calendar & availability engine (MVP)
-- Idempotent. Reuses booking_slot_locks (GIST exclusion) as the
-- authoritative double-booking guard.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  local_start_time time NOT NULL,
  local_end_time time NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Copenhagen',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_availability_rules_time_ck CHECK (local_start_time < local_end_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_availability_rules TO authenticated;
GRANT ALL ON public.provider_availability_rules TO service_role;
ALTER TABLE public.provider_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS provider_availability_rules_provider_idx
  ON public.provider_availability_rules(provider_user_id, weekday) WHERE is_active;

DROP POLICY IF EXISTS provider_availability_rules_owner ON public.provider_availability_rules;
CREATE POLICY provider_availability_rules_owner
  ON public.provider_availability_rules FOR ALL TO authenticated
  USING (provider_user_id = auth.uid())
  WITH CHECK (provider_user_id = auth.uid());

DROP POLICY IF EXISTS provider_availability_rules_admin_read ON public.provider_availability_rules;
CREATE POLICY provider_availability_rules_admin_read
  ON public.provider_availability_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.provider_calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_type text NOT NULL DEFAULT 'time_block'
    CHECK (block_type IN ('day_off','time_block','vacation')),
  title text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Europe/Copenhagen',
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','booking','future_ical','future_google','future_outlook')),
  external_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_calendar_blocks_time_ck CHECK (starts_at < ends_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_calendar_blocks TO authenticated;
GRANT ALL ON public.provider_calendar_blocks TO service_role;
ALTER TABLE public.provider_calendar_blocks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS provider_calendar_blocks_provider_time_idx
  ON public.provider_calendar_blocks(provider_user_id, starts_at, ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS provider_calendar_blocks_external_uidx
  ON public.provider_calendar_blocks(provider_user_id, source, external_reference)
  WHERE external_reference IS NOT NULL;

DROP POLICY IF EXISTS provider_calendar_blocks_owner ON public.provider_calendar_blocks;
CREATE POLICY provider_calendar_blocks_owner
  ON public.provider_calendar_blocks FOR ALL TO authenticated
  USING (provider_user_id = auth.uid())
  WITH CHECK (provider_user_id = auth.uid() AND source = 'manual');

DROP POLICY IF EXISTS provider_calendar_blocks_admin_read ON public.provider_calendar_blocks;
CREATE POLICY provider_calendar_blocks_admin_read
  ON public.provider_calendar_blocks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS provider_availability_rules_touch ON public.provider_availability_rules;
CREATE TRIGGER provider_availability_rules_touch
  BEFORE UPDATE ON public.provider_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS provider_calendar_blocks_touch ON public.provider_calendar_blocks;
CREATE TRIGGER provider_calendar_blocks_touch
  BEFORE UPDATE ON public.provider_calendar_blocks
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ------------------------------------------------------------
-- Timezone resolution (IANA, DST-safe)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_calendar_timezone_v1(_provider_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT r.timezone FROM public.provider_availability_rules r
      WHERE r.provider_user_id = _provider_user_id AND r.is_active LIMIT 1),
    (SELECT c.timezone FROM public.provider_profiles p
       JOIN public.country_configs c ON upper(c.iso) = upper(p.base_country_code)
      WHERE p.user_id = _provider_user_id LIMIT 1),
    'Europe/Copenhagen'
  );
$$;

-- ------------------------------------------------------------
-- Expand weekly rules into concrete working windows (UTC instants)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_working_windows_v1(
  _provider_user_id uuid, _from date, _to date)
RETURNS TABLE(win_start timestamptz, win_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH tz AS (SELECT public.provider_calendar_timezone_v1(_provider_user_id) AS name),
  days AS (
    SELECT d::date AS day FROM generate_series(_from, _to, interval '1 day') d
  )
  SELECT ((d.day + r.local_start_time)::timestamp AT TIME ZONE tz.name),
         ((d.day + r.local_end_time)::timestamp   AT TIME ZONE tz.name)
    FROM days d
    CROSS JOIN tz
    JOIN public.provider_availability_rules r
      ON r.provider_user_id = _provider_user_id
     AND r.is_active
     AND r.weekday = EXTRACT(isodow FROM d.day)::smallint
   ORDER BY 1;
$$;

-- ------------------------------------------------------------
-- Busy intervals: active slot locks + accepted bookings + blocks
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_busy_intervals_v1(
  _provider_user_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(busy_start timestamptz, busy_end timestamptz, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT l.starts_at, l.ends_at, 'booking'
    FROM public.booking_slot_locks l
   WHERE l.provider_user_id = _provider_user_id
     AND l.status = 'active'
     AND l.starts_at < _to AND l.ends_at > _from
  UNION ALL
  SELECT i.starts_at, i.ends_at, 'booking'
    FROM public.bookings b
    CROSS JOIN LATERAL public.booking_interval_from_row(b) i
   WHERE b.assigned_provider_id = _provider_user_id
     AND b.status::text = 'accepted'
     AND b.booking_date BETWEEN (_from - interval '2 days')::date AND (_to + interval '2 days')::date
     AND i.starts_at < _to AND i.ends_at > _from
  UNION ALL
  SELECT k.starts_at, k.ends_at, 'block'
    FROM public.provider_calendar_blocks k
   WHERE k.provider_user_id = _provider_user_id
     AND k.starts_at < _to AND k.ends_at > _from;
$$;

-- ------------------------------------------------------------
-- Validate a concrete slot (authoritative)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_provider_slot_v1(
  _provider_user_id uuid, _starts_at timestamptz, _duration_minutes integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ends timestamptz;
  v_has_rules boolean;
BEGIN
  IF _provider_user_id IS NULL OR _starts_at IS NULL
     OR _duration_minutes IS NULL OR _duration_minutes <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  v_ends := _starts_at + make_interval(mins => _duration_minutes);

  IF _starts_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SLOT_IN_PAST');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.provider_availability_rules r
                  WHERE r.provider_user_id = _provider_user_id AND r.is_active)
    INTO v_has_rules;
  IF NOT v_has_rules THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROVIDER_NO_WORKING_HOURS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provider_working_windows_v1(
                    _provider_user_id,
                    (_starts_at - interval '2 days')::date,
                    (v_ends + interval '2 days')::date) w
     WHERE w.win_start <= _starts_at AND w.win_end >= v_ends
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUTSIDE_WORKING_HOURS');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.provider_busy_intervals_v1(_provider_user_id, _starts_at, v_ends) b
     WHERE b.busy_start < v_ends AND b.busy_end > _starts_at
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CALENDAR_SLOT_UNAVAILABLE');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK',
    'starts_at', _starts_at, 'ends_at', v_ends,
    'timezone', public.provider_calendar_timezone_v1(_provider_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.validate_provider_slot_v1(uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_provider_slot_v1(uuid, timestamptz, integer)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Customer-facing: available start times only (no private data)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_provider_available_slots_v1(
  _provider_user_id uuid,
  _from date,
  _to date,
  _duration_minutes integer DEFAULT 120,
  _step_minutes integer DEFAULT 30)
RETURNS TABLE(slot_start timestamptz, local_date date, local_time text, timezone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz text;
  v_from date;
  v_to date;
  v_dur integer := GREATEST(30, LEAST(COALESCE(_duration_minutes, 120), 720));
  v_step integer := CASE WHEN COALESCE(_step_minutes, 30) IN (15, 30, 60) THEN _step_minutes ELSE 30 END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_profiles p
     WHERE p.user_id = _provider_user_id AND p.status = 'active'
  ) THEN
    RETURN;
  END IF;

  v_tz := public.provider_calendar_timezone_v1(_provider_user_id);
  v_from := GREATEST(COALESCE(_from, current_date), current_date);
  v_to := LEAST(COALESCE(_to, current_date + 30), current_date + 90);
  IF v_from > v_to THEN RETURN; END IF;

  RETURN QUERY
  WITH windows AS (
    SELECT w.win_start, w.win_end
      FROM public.provider_working_windows_v1(_provider_user_id, v_from, v_to) w
  ),
  candidates AS (
    SELECT gs AS s, w.win_end
      FROM windows w
      CROSS JOIN LATERAL generate_series(
        w.win_start,
        w.win_end - make_interval(mins => v_dur),
        make_interval(mins => v_step)) gs
  ),
  filtered AS (
    SELECT c.s
      FROM candidates c
     WHERE c.s > now() + interval '2 hours'
       AND NOT EXISTS (
         SELECT 1 FROM public.provider_busy_intervals_v1(
                         _provider_user_id, c.s, c.s + make_interval(mins => v_dur)) b
          WHERE b.busy_start < c.s + make_interval(mins => v_dur)
            AND b.busy_end > c.s
       )
  )
  SELECT f.s,
         (f.s AT TIME ZONE v_tz)::date,
         to_char(f.s AT TIME ZONE v_tz, 'HH24:MI'),
         v_tz
    FROM filtered f
   ORDER BY f.s;
END;
$$;

REVOKE ALL ON FUNCTION public.get_provider_available_slots_v1(uuid, date, date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_available_slots_v1(uuid, date, date, integer, integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_provider_available_slots_v1(uuid, date, date, integer, integer) IS
  'Derived availability only. Never exposes bookings, block titles or customer data.';

-- Public profile slot list now respects working hours and blocks.
CREATE OR REPLACE FUNCTION public.list_provider_bookable_slots_v1(
  _slug text, _from date, _to date)
RETURNS TABLE(slot_date date, slot_hour smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
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

  RETURN QUERY
  SELECT DISTINCT s.local_date,
         split_part(s.local_time, ':', 1)::smallint
    FROM public.get_provider_available_slots_v1(
           v_user_id, GREATEST(_from, current_date),
           LEAST(_to, current_date + 14), 120, 60) s
   ORDER BY 1, 2;
END;
$$;

-- ------------------------------------------------------------
-- Provider: manage weekly working hours
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_set_availability_v1(
  _timezone text, _rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tz text := COALESCE(NULLIF(_timezone, ''), 'Europe/Copenhagen');
  r jsonb;
  v_wd smallint;
  v_start time;
  v_end time;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(_rules, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Validate every interval, then overlap within the same weekday.
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_rules, '[]'::jsonb)) LOOP
    v_wd := (r->>'weekday')::smallint;
    v_start := (r->>'local_start_time')::time;
    v_end := (r->>'local_end_time')::time;
    IF v_wd IS NULL OR v_wd < 1 OR v_wd > 7 THEN
      RAISE EXCEPTION 'INVALID_WEEKDAY' USING ERRCODE = '22023';
    END IF;
    IF v_start IS NULL OR v_end IS NULL OR v_start >= v_end THEN
      RAISE EXCEPTION 'INVALID_INTERVAL' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(_rules, '[]'::jsonb)) a(v)
      JOIN jsonb_array_elements(COALESCE(_rules, '[]'::jsonb)) WITH ORDINALITY b(v, ord) ON true
      JOIN LATERAL (SELECT 1) x ON true
     WHERE (a.v->>'weekday') = (b.v->>'weekday')
       AND a.v <> b.v
       AND (a.v->>'local_start_time')::time < (b.v->>'local_end_time')::time
       AND (a.v->>'local_end_time')::time > (b.v->>'local_start_time')::time
  ) THEN
    RAISE EXCEPTION 'OVERLAPPING_INTERVALS' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.provider_availability_rules WHERE provider_user_id = v_uid;

  INSERT INTO public.provider_availability_rules
    (provider_user_id, weekday, local_start_time, local_end_time, timezone, is_active)
  SELECT v_uid,
         (v->>'weekday')::smallint,
         (v->>'local_start_time')::time,
         (v->>'local_end_time')::time,
         v_tz,
         COALESCE((v->>'is_active')::boolean, true)
    FROM jsonb_array_elements(COALESCE(_rules, '[]'::jsonb)) x(v);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'rules', v_count, 'timezone', v_tz);
END;
$$;

REVOKE ALL ON FUNCTION public.provider_set_availability_v1(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_set_availability_v1(text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Provider: manage calendar blocks (never overwrite accepted bookings)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_upsert_calendar_block_v1(
  _id uuid,
  _block_type text,
  _title text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _all_day boolean DEFAULT false)
RETURNS public.provider_calendar_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.provider_calendar_blocks;
  v_tz text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _starts_at IS NULL OR _ends_at IS NULL OR _starts_at >= _ends_at THEN
    RAISE EXCEPTION 'INVALID_INTERVAL' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(_block_type, 'time_block') NOT IN ('day_off','time_block','vacation') THEN
    RAISE EXCEPTION 'INVALID_BLOCK_TYPE' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.provider_busy_intervals_v1(v_uid, _starts_at, _ends_at) b
     WHERE b.kind = 'booking'
       AND b.busy_start < _ends_at AND b.busy_end > _starts_at
  ) THEN
    RAISE EXCEPTION 'BLOCK_CONFLICTS_BOOKING' USING ERRCODE = '23P01';
  END IF;

  v_tz := public.provider_calendar_timezone_v1(v_uid);

  IF _id IS NULL THEN
    INSERT INTO public.provider_calendar_blocks
      (provider_user_id, block_type, title, starts_at, ends_at, all_day, timezone, source)
    VALUES (v_uid, COALESCE(_block_type,'time_block'), NULLIF(_title,''),
            _starts_at, _ends_at, COALESCE(_all_day,false), v_tz, 'manual')
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.provider_calendar_blocks
       SET block_type = COALESCE(_block_type, block_type),
           title = NULLIF(_title,''),
           starts_at = _starts_at,
           ends_at = _ends_at,
           all_day = COALESCE(_all_day,false),
           updated_at = now()
     WHERE id = _id AND provider_user_id = v_uid AND source = 'manual'
     RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'BLOCK_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_upsert_calendar_block_v1(uuid, text, text, timestamptz, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_upsert_calendar_block_v1(uuid, text, text, timestamptz, timestamptz, boolean)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_delete_calendar_block_v1(_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.provider_calendar_blocks
   WHERE id = _id AND provider_user_id = v_uid AND source = 'manual';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_delete_calendar_block_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_delete_calendar_block_v1(uuid) TO authenticated, service_role;
