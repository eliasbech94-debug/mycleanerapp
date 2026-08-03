-- Add a narrow, transaction-local escape hatch that ONLY the trusted
-- lifecycle RPC can set. Everything else keeps the previous restrictions.
CREATE OR REPLACE FUNCTION public.enforce_booking_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_customer boolean;
  is_provider boolean;
BEGIN
  -- Privileged paths bypass the guard entirely:
  --   * service_role / postgres (edge functions, workers, migrations)
  --   * SECURITY DEFINER RPCs running as the table owner
  --   * admins
  --   * the trusted booking lifecycle state machine (transaction-local flag,
  --     set only inside public.booking_lifecycle_transition_v1)
  IF uid IS NULL
     OR current_setting('role', true) IN ('service_role', 'postgres')
     OR current_setting('app.booking_lifecycle_scope', true) = 'on'
     OR public.has_role(uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  is_customer := (uid = OLD.customer_user_id);
  is_provider := public.user_owns_provider(OLD.provider_id);

  -- ── Customer path: cancellation only ───────────────────────────────────
  IF is_customer AND NOT is_provider THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status = 'cancelled'::booking_status THEN
      NEW.customer_user_id       := OLD.customer_user_id;
      NEW.provider_id            := OLD.provider_id;
      NEW.assigned_provider_id   := OLD.assigned_provider_id;
      NEW.requested_provider_id  := OLD.requested_provider_id;
      NEW.provider_name          := OLD.provider_name;
      NEW.service                := OLD.service;
      NEW.hours                  := OLD.hours;
      NEW.booking_date           := OLD.booking_date;
      NEW.slot                   := OLD.slot;
      NEW.address                := OLD.address;
      NEW.notes                  := OLD.notes;
      NEW.customer_pays          := OLD.customer_pays;
      NEW.provider_gets          := OLD.provider_gets;
      NEW.currency               := OLD.currency;
      NEW.country_code           := OLD.country_code;
      NEW.timezone               := OLD.timezone;
      NEW.assignment_mode        := OLD.assignment_mode;
      NEW.dispatch_status        := OLD.dispatch_status;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'booking_update_forbidden: customers may only cancel a pending booking'
      USING ERRCODE = '42501';
  END IF;

  -- ── Provider path: no financial or payment mutations ───────────────────
  IF is_provider THEN
    NEW.customer_pays        := OLD.customer_pays;
    NEW.provider_gets        := OLD.provider_gets;
    NEW.currency             := OLD.currency;
    NEW.customer_user_id     := OLD.customer_user_id;
    NEW.provider_id          := OLD.provider_id;
    NEW.assigned_provider_id := OLD.assigned_provider_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- Wrap the state machine's writes in the scope flag.
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
  v_now timestamptz := clock_timestamp();
  v_prev public.booking_lifecycle_events%ROWTYPE;
  v_pause integer;
  v_final public.booking_lifecycle_state;
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

  -- Authorised: open the narrow write scope for this transaction only.
  PERFORM set_config('app.booking_lifecycle_scope','on', true);

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

  -- Close the scope immediately; it must never outlive this call.
  PERFORM set_config('app.booking_lifecycle_scope','off', true);

  SELECT lifecycle_state INTO v_final FROM public.bookings WHERE id=_booking_id;
  RETURN jsonb_build_object('booking_id',_booking_id,'state',v_final,'applied',true,
    'actor_role',v_role,'at',v_now);
END $$;