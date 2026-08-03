-- Validate a requested booking time (server authority) before booking insert.
CREATE OR REPLACE FUNCTION public.validate_booking_slot_request_v1(
  _provider_user_id uuid,
  _booking_date date,
  _slot text,
  _duration_minutes integer,
  _customer_user_id uuid,
  _lock_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_tz text;
  v_start timestamptz;
  v_ends timestamptz;
  v_dur integer := GREATEST(30, LEAST(COALESCE(_duration_minutes, 120), 720));
  v_lock public.booking_slot_locks;
  v_check jsonb;
BEGIN
  IF _provider_user_id IS NULL OR _booking_date IS NULL OR _slot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  IF _slot !~ '^[0-2][0-9]:[0-5][0-9]$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SLOT_FORMAT');
  END IF;

  v_tz := public.provider_calendar_timezone_v1(_provider_user_id);
  v_start := (_booking_date + _slot::time) AT TIME ZONE v_tz;
  v_ends := v_start + make_interval(mins => v_dur);

  -- A valid, customer-owned lock covering the slot short-circuits the
  -- busy-interval check (the lock itself is the reservation).
  IF _lock_id IS NOT NULL THEN
    SELECT * INTO v_lock FROM public.booking_slot_locks WHERE id = _lock_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'LOCK_NOT_FOUND');
    END IF;
    IF v_lock.customer_user_id IS DISTINCT FROM _customer_user_id
       OR v_lock.provider_user_id IS DISTINCT FROM _provider_user_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'LOCK_FORBIDDEN');
    END IF;
    IF v_lock.status <> 'active' OR v_lock.expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'code', 'LOCK_EXPIRED');
    END IF;
    IF v_lock.starts_at <> v_start OR v_lock.ends_at <> v_ends THEN
      RETURN jsonb_build_object('ok', false, 'code', 'LOCK_SLOT_MISMATCH');
    END IF;
  END IF;

  IF v_start <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SLOT_IN_PAST');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.provider_working_windows_v1(
                    _provider_user_id,
                    (v_start - interval '2 days')::date,
                    (v_ends + interval '2 days')::date) w
     WHERE w.win_start <= v_start AND w.win_end >= v_ends
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUTSIDE_WORKING_HOURS');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.provider_busy_intervals_v1(_provider_user_id, v_start, v_ends) b
     WHERE b.busy_start < v_ends AND b.busy_end > v_start
       AND NOT (_lock_id IS NOT NULL AND b.kind = 'lock'
                AND b.busy_start = v_start AND b.busy_end = v_ends)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CALENDAR_SLOT_UNAVAILABLE');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK',
    'starts_at', v_start, 'ends_at', v_ends, 'timezone', v_tz);
END;
$function$;

-- Accept guard: re-validate, block overlapping accepted bookings, consume lock.
CREATE OR REPLACE FUNCTION public.booking_accept_slot_guard_v1(
  _booking_id uuid, _provider_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_b public.bookings%ROWTYPE;
  v_start timestamptz;
  v_ends timestamptz;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BOOKING_NOT_FOUND');
  END IF;

  SELECT s, e INTO v_start, v_ends
    FROM public.booking_interval_from_row(v_b) AS x(s, e);

  PERFORM pg_advisory_xact_lock(hashtextextended(_provider_user_id::text, 0));
  PERFORM public.expire_booking_slot_locks_v1();

  IF EXISTS (
    SELECT 1
      FROM public.bookings b
      CROSS JOIN LATERAL public.booking_interval_from_row(b) i
     WHERE b.id <> _booking_id
       AND b.assigned_provider_id = _provider_user_id
       AND b.status::text IN ('accepted','in_progress')
       AND i.starts_at < v_ends AND i.ends_at > v_start
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OVERLAPPING_ACCEPTED_BOOKING');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.provider_calendar_blocks k
     WHERE k.provider_user_id = _provider_user_id
       AND k.starts_at < v_ends AND k.ends_at > v_start
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CALENDAR_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_slot_locks l
     WHERE l.provider_user_id = _provider_user_id
       AND l.status = 'active'
       AND l.expires_at > now()
       AND COALESCE(l.booking_id, '00000000-0000-0000-0000-000000000000'::uuid) <> _booking_id
       AND l.starts_at < v_ends AND l.ends_at > v_start
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SLOT_LOCKED_BY_OTHER');
  END IF;

  UPDATE public.booking_slot_locks
     SET status = 'consumed', released_at = now()
   WHERE booking_id = _booking_id AND status = 'active';

  RETURN jsonb_build_object('ok', true, 'code', 'OK',
    'starts_at', v_start, 'ends_at', v_ends);
END;
$function$;

-- Release every active lock tied to a booking (decline / cancel).
CREATE OR REPLACE FUNCTION public.booking_release_slot_locks_v1(_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.booking_slot_locks
     SET status = 'released', released_at = now()
   WHERE booking_id = _booking_id AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_booking_slot_request_v1(uuid, date, text, integer, uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_accept_slot_guard_v1(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_release_slot_locks_v1(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_booking_slot_request_v1(uuid, date, text, integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_accept_slot_guard_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_release_slot_locks_v1(uuid) TO service_role;