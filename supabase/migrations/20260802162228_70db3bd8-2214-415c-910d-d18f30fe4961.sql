-- 1) Weekly availability: DB-level overlap prevention
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION public.availability_time_range(_start time, _end time)
RETURNS numrange
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
  SELECT numrange(
    (EXTRACT(epoch FROM _start))::numeric,
    (EXTRACT(epoch FROM _end))::numeric,
    '[)')
$function$;

DELETE FROM public.provider_availability_rules a
 USING public.provider_availability_rules b
 WHERE a.ctid > b.ctid
   AND a.provider_user_id = b.provider_user_id
   AND a.weekday = b.weekday
   AND a.is_active AND b.is_active
   AND a.local_start_time < b.local_end_time
   AND a.local_end_time > b.local_start_time;

ALTER TABLE public.provider_availability_rules
  ADD CONSTRAINT provider_availability_rules_no_overlap
  EXCLUDE USING gist (
    provider_user_id WITH =,
    weekday WITH =,
    public.availability_time_range(local_start_time, local_end_time) WITH &&
  ) WHERE (is_active);

-- 2) Exceptions / external blocks
ALTER TABLE public.provider_calendar_blocks
  DROP CONSTRAINT IF EXISTS provider_calendar_blocks_block_type_check;
ALTER TABLE public.provider_calendar_blocks
  ADD CONSTRAINT provider_calendar_blocks_block_type_check
  CHECK (block_type IN ('day_off','time_block','vacation','sick_leave','external'));

ALTER TABLE public.provider_calendar_blocks
  DROP CONSTRAINT IF EXISTS provider_calendar_blocks_source_check;
ALTER TABLE public.provider_calendar_blocks
  ADD CONSTRAINT provider_calendar_blocks_source_check
  CHECK (source IN ('manual','booking','ical','future_ical','future_google','future_outlook'));

CREATE UNIQUE INDEX IF NOT EXISTS provider_calendar_blocks_external_uidx
  ON public.provider_calendar_blocks (provider_user_id, source, external_reference)
  WHERE external_reference IS NOT NULL;

-- 3) Slot locks: customer, expiry, idempotency
ALTER TABLE public.booking_slot_locks
  ALTER COLUMN booking_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS customer_user_id uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.booking_slot_locks
   SET expires_at = COALESCE(expires_at, created_at + interval '10 minutes')
 WHERE expires_at IS NULL;

ALTER TABLE public.booking_slot_locks
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 minutes');
ALTER TABLE public.booking_slot_locks
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.booking_slot_locks
  DROP CONSTRAINT IF EXISTS booking_slot_locks_status_check;
ALTER TABLE public.booking_slot_locks
  ADD CONSTRAINT booking_slot_locks_status_check
  CHECK (status IN ('active','released','cancelled','expired','consumed'));

CREATE UNIQUE INDEX IF NOT EXISTS booking_slot_locks_idem_uidx
  ON public.booking_slot_locks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_slot_locks_provider_active_idx
  ON public.booking_slot_locks (provider_user_id, starts_at)
  WHERE status = 'active';

-- 4) Expired locks must not block availability
CREATE OR REPLACE FUNCTION public.provider_busy_intervals_v1(
  _provider_user_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(busy_start timestamptz, busy_end timestamptz, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  SELECT l.starts_at, l.ends_at, 'lock'
    FROM public.booking_slot_locks l
   WHERE l.provider_user_id = _provider_user_id
     AND l.status = 'active'
     AND l.expires_at > now()
     AND l.starts_at < _to AND l.ends_at > _from
  UNION ALL
  SELECT i.starts_at, i.ends_at, 'booking'
    FROM public.bookings b
    CROSS JOIN LATERAL public.booking_interval_from_row(b) i
   WHERE b.assigned_provider_id = _provider_user_id
     AND b.status::text IN ('accepted','in_progress','completed')
     AND b.booking_date BETWEEN (_from - interval '2 days')::date AND (_to + interval '2 days')::date
     AND i.starts_at < _to AND i.ends_at > _from
  UNION ALL
  SELECT k.starts_at, k.ends_at, 'block'
    FROM public.provider_calendar_blocks k
   WHERE k.provider_user_id = _provider_user_id
     AND k.starts_at < _to AND k.ends_at > _from;
$function$;

-- 5) Expiry sweeper
CREATE OR REPLACE FUNCTION public.expire_booking_slot_locks_v1()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.booking_slot_locks
     SET status = 'expired', released_at = now()
   WHERE status = 'active' AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- 6) Atomic lock acquisition (idempotent)
CREATE OR REPLACE FUNCTION public.acquire_booking_slot_lock_v1(
  _provider_user_id uuid,
  _starts_at timestamptz,
  _duration_minutes integer,
  _idempotency_key text,
  _ttl_seconds integer DEFAULT 600)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ttl integer := GREATEST(60, LEAST(COALESCE(_ttl_seconds, 600), 1800));
  v_dur integer := GREATEST(30, LEAST(COALESCE(_duration_minutes, 120), 720));
  v_ends timestamptz;
  v_check jsonb;
  v_row public.booking_slot_locks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _provider_user_id IS NULL OR _starts_at IS NULL
     OR _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  v_ends := _starts_at + make_interval(mins => v_dur);

  PERFORM public.expire_booking_slot_locks_v1();

  SELECT * INTO v_row FROM public.booking_slot_locks
   WHERE idempotency_key = _idempotency_key FOR UPDATE;

  IF FOUND THEN
    IF v_row.customer_user_id IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    END IF;
    IF v_row.status = 'active'
       AND v_row.provider_user_id = _provider_user_id
       AND v_row.starts_at = _starts_at
       AND v_row.ends_at = v_ends THEN
      UPDATE public.booking_slot_locks
         SET expires_at = now() + make_interval(secs => v_ttl)
       WHERE id = v_row.id
       RETURNING * INTO v_row;
      RETURN jsonb_build_object('ok', true, 'code', 'OK', 'replay', true,
        'lock_id', v_row.id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at,
        'expires_at', v_row.expires_at,
        'timezone', public.provider_calendar_timezone_v1(_provider_user_id));
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REUSED');
  END IF;

  -- serialize concurrent attempts per provider
  PERFORM pg_advisory_xact_lock(hashtextextended(_provider_user_id::text, 0));

  v_check := public.validate_provider_slot_v1(_provider_user_id, _starts_at, v_dur);
  IF NOT COALESCE((v_check->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', COALESCE(v_check->>'code','SLOT_UNAVAILABLE'));
  END IF;

  BEGIN
    INSERT INTO public.booking_slot_locks
      (provider_user_id, customer_user_id, booking_id, starts_at, ends_at,
       status, expires_at, idempotency_key, hours, reason)
    VALUES
      (_provider_user_id, v_uid, NULL, _starts_at, v_ends,
       'active', now() + make_interval(secs => v_ttl), _idempotency_key,
       round(v_dur::numeric / 60, 2), 'checkout')
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SLOT_TAKEN');
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REUSED');
  END;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'replay', false,
    'lock_id', v_row.id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at,
    'expires_at', v_row.expires_at,
    'timezone', public.provider_calendar_timezone_v1(_provider_user_id));
END;
$function$;

-- 7) Release a lock (customer or assigned provider)
CREATE OR REPLACE FUNCTION public.release_booking_slot_lock_v1(_lock_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.booking_slot_locks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.booking_slot_locks WHERE id = _lock_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_row.customer_user_id IS DISTINCT FROM v_uid
     AND v_row.provider_user_id IS DISTINCT FROM v_uid
     AND NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;
  UPDATE public.booking_slot_locks
     SET status = 'released', released_at = now()
   WHERE id = _lock_id AND status = 'active';
  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$function$;

-- 8) Bind / consume a lock (service role only, used by booking creation & accept)
CREATE OR REPLACE FUNCTION public.bind_booking_slot_lock_v1(
  _lock_id uuid, _booking_id uuid, _consume boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_row public.booking_slot_locks;
BEGIN
  IF current_setting('role', true) NOT IN ('service_role')
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.booking_slot_locks
     SET booking_id = COALESCE(_booking_id, booking_id),
         status = CASE WHEN _consume THEN 'consumed' ELSE status END,
         released_at = CASE WHEN _consume THEN now() ELSE released_at END,
         expires_at = CASE WHEN _consume THEN expires_at
                           ELSE GREATEST(expires_at, now() + interval '30 minutes') END
   WHERE id = _lock_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'status', v_row.status);
END;
$function$;

-- 9) RLS on slot locks
ALTER TABLE public.booking_slot_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers read own slot locks" ON public.booking_slot_locks;
CREATE POLICY "Customers read own slot locks"
  ON public.booking_slot_locks FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());
DROP POLICY IF EXISTS "Providers read locks on own calendar" ON public.booking_slot_locks;
CREATE POLICY "Providers read locks on own calendar"
  ON public.booking_slot_locks FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.booking_slot_locks FROM authenticated;
GRANT SELECT ON public.booking_slot_locks TO authenticated;
GRANT ALL ON public.booking_slot_locks TO service_role;

REVOKE ALL ON FUNCTION public.bind_booking_slot_lock_v1(uuid, uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_booking_slot_lock_v1(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_booking_slot_lock_v1(uuid, timestamptz, integer, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_booking_slot_lock_v1(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_booking_slot_locks_v1() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_booking_slot_locks_v1() TO service_role;

-- 10) iCal foundation: connections storage
CREATE TABLE IF NOT EXISTS public.provider_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_kind text NOT NULL DEFAULT 'ical',
  ical_url text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_synced_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  imported_events integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_calendar_connections_status_ck
    CHECK (status IN ('active','error','disconnected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_calendar_connections_active_uidx
  ON public.provider_calendar_connections (provider_user_id)
  WHERE status <> 'disconnected';

GRANT SELECT (id, provider_user_id, provider_kind, status, last_synced_at,
              last_error_code, last_error_at, next_sync_at, imported_events,
              created_at, updated_at)
  ON public.provider_calendar_connections TO authenticated;
GRANT ALL ON public.provider_calendar_connections TO service_role;

ALTER TABLE public.provider_calendar_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers read own calendar connections" ON public.provider_calendar_connections;
CREATE POLICY "Providers read own calendar connections"
  ON public.provider_calendar_connections FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_provider_calendar_connections_touch ON public.provider_calendar_connections;
CREATE TRIGGER trg_provider_calendar_connections_touch
  BEFORE UPDATE ON public.provider_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.provider_calendar_store_ical_secret_v1(
  _provider_user_id uuid, _ical_url text)
RETURNS public.provider_calendar_connections
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_row public.provider_calendar_connections;
BEGIN
  INSERT INTO public.provider_calendar_connections
    (provider_user_id, ical_url, status, next_sync_at)
  VALUES (_provider_user_id, _ical_url, 'active', now())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.provider_calendar_disconnect_v1(
  _connection_id uuid, _provider_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  UPDATE public.provider_calendar_connections
     SET status = 'disconnected', ical_url = '', next_sync_at = 'infinity'
   WHERE id = _connection_id AND provider_user_id = _provider_user_id;
  UPDATE public.provider_calendar_blocks
     SET metadata = metadata || jsonb_build_object('disconnected_at', now())
   WHERE provider_user_id = _provider_user_id AND source = 'ical';
  DELETE FROM public.provider_calendar_blocks
   WHERE provider_user_id = _provider_user_id AND source = 'ical';
END;
$function$;

CREATE OR REPLACE FUNCTION public.provider_calendar_get_ical_secret_v1(_connection_id uuid)
RETURNS TABLE(ical_url text, provider_user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  SELECT c.ical_url, c.provider_user_id
    FROM public.provider_calendar_connections c
   WHERE c.id = _connection_id AND c.status <> 'disconnected';
$function$;

CREATE OR REPLACE FUNCTION public.provider_calendar_mark_sync_error_v1(
  _connection_id uuid, _error_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  UPDATE public.provider_calendar_connections
     SET status = 'error',
         last_error_code = left(COALESCE(_error_code, 'sync_failed'), 64),
         last_error_at = now(),
         next_sync_at = now() + interval '1 hour'
   WHERE id = _connection_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.provider_calendar_replace_external_blocks_v1(
  _connection_id uuid, _blocks jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_provider uuid;
  v_tz text;
  v_count integer := 0;
  v_keys text[];
BEGIN
  SELECT provider_user_id INTO v_provider
    FROM public.provider_calendar_connections
   WHERE id = _connection_id AND status <> 'disconnected';
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(COALESCE(_blocks, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_blocks' USING ERRCODE = '22023';
  END IF;

  v_tz := public.provider_calendar_timezone_v1(v_provider);

  SELECT array_agg(DISTINCT _connection_id::text || ':' || (b->>'event_hash'))
    INTO v_keys
    FROM jsonb_array_elements(_blocks) b
   WHERE COALESCE(b->>'event_hash','') <> ''
     AND (b->>'starts_at')::timestamptz < (b->>'ends_at')::timestamptz;

  INSERT INTO public.provider_calendar_blocks
    (provider_user_id, block_type, title, starts_at, ends_at, all_day,
     timezone, source, external_reference, metadata)
  SELECT v_provider, 'external', NULL,
         (b->>'starts_at')::timestamptz, (b->>'ends_at')::timestamptz, false,
         v_tz, 'ical', _connection_id::text || ':' || (b->>'event_hash'),
         jsonb_build_object('connection_id', _connection_id)
    FROM jsonb_array_elements(_blocks) b
   WHERE COALESCE(b->>'event_hash','') <> ''
     AND (b->>'starts_at')::timestamptz < (b->>'ends_at')::timestamptz
  ON CONFLICT (provider_user_id, source, external_reference)
  DO UPDATE SET starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Remove events that disappeared from the feed (only for this connection,
  -- and only when the feed actually returned events).
  IF v_keys IS NOT NULL AND array_length(v_keys, 1) > 0 THEN
    DELETE FROM public.provider_calendar_blocks
     WHERE provider_user_id = v_provider
       AND source = 'ical'
       AND external_reference LIKE _connection_id::text || ':%'
       AND NOT (external_reference = ANY (v_keys));
  END IF;

  UPDATE public.provider_calendar_connections
     SET status = 'active', last_synced_at = now(),
         last_error_code = NULL, last_error_at = NULL,
         imported_events = COALESCE(array_length(v_keys, 1), 0),
         next_sync_at = now() + interval '30 minutes'
   WHERE id = _connection_id;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_calendar_get_ical_secret_v1(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_calendar_store_ical_secret_v1(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_calendar_replace_external_blocks_v1(uuid, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_calendar_mark_sync_error_v1(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_calendar_disconnect_v1(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_calendar_get_ical_secret_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_calendar_store_ical_secret_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_calendar_replace_external_blocks_v1(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_calendar_mark_sync_error_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_calendar_disconnect_v1(uuid, uuid) TO service_role;