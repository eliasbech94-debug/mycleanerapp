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
       AND (b.assigned_provider_id = _provider_user_id
            OR (v_b.provider_id IS NOT NULL AND b.provider_id = v_b.provider_id))
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