CREATE OR REPLACE FUNCTION public.booking_lifecycle_transition_v1(
  _booking_id uuid,
  _to_state public.booking_lifecycle_state,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b public.bookings%ROWTYPE;
  v_uid uuid := auth.uid();
  v_role text;
  v_from public.booking_lifecycle_state;
  -- clock_timestamp(): now() is frozen per transaction, which would make
  -- pause/resume durations inside one transaction always evaluate to zero.
  v_now timestamptz := clock_timestamp();
  v_prev public.booking_lifecycle_events%ROWTYPE;
  v_pause integer;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0002'; END IF;

  IF v_uid IS NULL THEN
    v_role := 'system';
  ELSIF public.has_role(v_uid,'admin') THEN
    v_role := 'admin';
  ELSIF v_b.customer_user_id = v_uid THEN
    v_role := 'customer';
  ELSIF v_b.provider_id = v_uid::text OR v_b.assigned_provider_id = v_uid THEN
    v_role := 'provider';
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.booking_lifecycle_events
     WHERE booking_id=_booking_id AND idempotency_key=_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id',_booking_id,'state',v_b.lifecycle_state,
        'applied',false,'idempotent',true,'event_id',v_prev.id);
    END IF;
  END IF;

  v_from := COALESCE(v_b.lifecycle_state,'pending');

  IF v_from = _to_state THEN
    RETURN jsonb_build_object('booking_id',_booking_id,'state',v_from,
      'applied',false,'idempotent',true);
  END IF;

  IF NOT public.booking_lifecycle_role_allowed_v1(v_role,_to_state) THEN
    RAISE EXCEPTION 'role_not_allowed: % cannot set %', v_role, _to_state USING ERRCODE='42501';
  END IF;

  IF NOT public.booking_lifecycle_allowed_v1(v_from,_to_state) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', v_from, _to_state USING ERRCODE='22023';
  END IF;

  IF _to_state = 'work_started' THEN
    UPDATE public.bookings SET work_started_at = COALESCE(work_started_at, v_now) WHERE id=_booking_id;
  ELSIF _to_state = 'paused' THEN
    UPDATE public.bookings SET last_paused_at = v_now WHERE id=_booking_id;
  ELSIF _to_state = 'resumed' THEN
    v_pause := GREATEST(0, EXTRACT(EPOCH FROM (v_now - COALESCE(v_b.last_paused_at, v_now)))::int);
    UPDATE public.bookings
       SET total_pause_seconds = COALESCE(total_pause_seconds,0) + v_pause,
           last_paused_at = NULL
     WHERE id=_booking_id;
  ELSIF _to_state = 'completed' THEN
    UPDATE public.bookings
       SET work_completed_at = COALESCE(work_completed_at, v_now),
           status = 'completed'::public.booking_status,
           active_work_seconds = GREATEST(0,
             EXTRACT(EPOCH FROM (v_now - COALESCE(work_started_at, v_now)))::int
             - COALESCE(total_pause_seconds,0))
     WHERE id=_booking_id;
  ELSIF _to_state = 'customer_confirmed' THEN
    UPDATE public.bookings
       SET customer_confirmed_at = COALESCE(customer_confirmed_at, v_now),
           funds_release_at = COALESCE(funds_release_at,
             v_now + make_interval(secs => public.booking_confirmation_hold_seconds_v1()))
     WHERE id=_booking_id;
  ELSIF _to_state IN ('accepted','declined','cancelled') THEN
    UPDATE public.bookings
       SET status = _to_state::text::public.booking_status,
           decided_at = COALESCE(decided_at, v_now)
     WHERE id=_booking_id;
  END IF;

  UPDATE public.bookings
     SET lifecycle_state = _to_state, lifecycle_updated_at = v_now
   WHERE id=_booking_id;

  INSERT INTO public.booking_lifecycle_events (
    booking_id, from_state, to_state, actor_user_id, actor_role,
    reason, metadata, idempotency_key, payment_reference, release_reference, created_at
  ) VALUES (
    _booking_id, v_from, _to_state, v_uid, v_role,
    _reason, COALESCE(_metadata,'{}'::jsonb), _idempotency_key,
    v_b.payment_intent_id, NULLIF(_metadata->>'release_reference',''), v_now
  );

  IF _to_state = 'completed' THEN
    UPDATE public.bookings
       SET lifecycle_state='awaiting_customer_confirmation', lifecycle_updated_at=v_now
     WHERE id=_booking_id;
    INSERT INTO public.booking_lifecycle_events (
      booking_id, from_state, to_state, actor_user_id, actor_role, reason, metadata, created_at
    ) VALUES (_booking_id,'completed','awaiting_customer_confirmation',NULL,'system',
      'auto_after_completion','{}'::jsonb, v_now);
  END IF;

  IF _to_state = 'customer_confirmed' THEN
    UPDATE public.bookings
       SET lifecycle_state='hold_active', lifecycle_updated_at=v_now
     WHERE id=_booking_id;
    INSERT INTO public.booking_lifecycle_events (
      booking_id, from_state, to_state, actor_user_id, actor_role, reason, metadata, created_at
    ) VALUES (_booking_id,'customer_confirmed','hold_active',NULL,'system',
      'confirmation_hold_started',
      jsonb_build_object('hold_seconds', public.booking_confirmation_hold_seconds_v1()), v_now);
  END IF;

  SELECT lifecycle_state INTO v_from FROM public.bookings WHERE id=_booking_id;
  RETURN jsonb_build_object('booking_id',_booking_id,'state',v_from,'applied',true,
    'actor_role',v_role,'at',v_now);
END $$;