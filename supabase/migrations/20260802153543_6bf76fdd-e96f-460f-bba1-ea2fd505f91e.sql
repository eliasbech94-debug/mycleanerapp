CREATE OR REPLACE FUNCTION public.validate_provider_slot_v1(_provider_user_id uuid, _starts_at timestamp with time zone, _duration_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  IF _starts_at <= now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEAD_TIME_NOT_MET');
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
$function$;
