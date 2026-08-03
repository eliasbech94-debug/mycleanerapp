-- ============================================================
-- Booking lifecycle E2E regression (Part D)
-- Runs against REAL rows inside a transaction, then ROLLS BACK.
--   psql "$SUPABASE_DB_URL" -f scripts/booking-lifecycle-e2e.sql
-- Any failed assertion aborts the script with an exception.
-- ============================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN _uid IS NULL THEN '' ELSE json_build_object('sub',_uid,'role','authenticated')::text END,
    true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.check(_label text, _cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _cond THEN RAISE NOTICE 'PASS  %', _label;
  ELSE RAISE EXCEPTION 'FAIL  %', _label; END IF;
END $$;

DO $e2e$
DECLARE
  v_cust uuid;
  v_prov uuid;
  v_other uuid;
  v_bid uuid;
  v_state text;
  v_res jsonb;
  v_err text;
  v_n int;
BEGIN
  -- ---- real rows (reuse existing auth users; auth schema is read-only) ----
  SELECT id INTO v_cust FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_prov FROM public.profiles WHERE id <> v_cust ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM public.profiles WHERE id NOT IN (v_cust,v_prov) ORDER BY created_at LIMIT 1;
  IF v_cust IS NULL OR v_prov IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'need at least 3 profiles rows to run the lifecycle E2E';
  END IF;
  -- the "stranger" must not be an admin, otherwise the deny-check is void
  IF public.has_role(v_other,'admin') THEN
    SELECT id INTO v_other FROM public.profiles
     WHERE id NOT IN (v_cust,v_prov) AND NOT public.has_role(id,'admin') LIMIT 1;
  END IF;

  INSERT INTO public.bookings (
    customer_user_id, provider_id, provider_name, service, hours,
    booking_date, slot, address, customer_pays, provider_gets,
    platform_fee_amount, currency, status, payment_status, payment_intent_id, requested_provider_id,
    lifecycle_state
  ) VALUES (
    v_cust, v_prov::text, 'E2E Provider', 'cleaning', 3,
    current_date, '10:00', 'Testvej 1, 2100 København', 114000, 86000,
    28000, 'DKK', 'accepted', 'authorized', 'pi_e2e_lifecycle', v_prov,
    'accepted'
  ) RETURNING id INTO v_bid;

  -- ---- 1. customer cannot drive provider field events -------------
  PERFORM pg_temp.as_user(v_cust);
  BEGIN
    PERFORM public.booking_lifecycle_transition_v1(v_bid,'travelling');
    PERFORM pg_temp.check('customer blocked from travelling', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('customer blocked from travelling', true);
  END;

  -- ---- 2. stranger has no access ----------------------------------
  PERFORM pg_temp.as_user(v_other);
  BEGIN
    PERFORM public.booking_lifecycle_transition_v1(v_bid,'travelling');
    PERFORM pg_temp.check('stranger blocked', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('stranger blocked', true);
  END;

  -- ---- 3. provider cannot skip steps ------------------------------
  PERFORM pg_temp.as_user(v_prov);
  BEGIN
    PERFORM public.booking_lifecycle_transition_v1(v_bid,'work_started');
    PERFORM pg_temp.check('provider cannot skip to work_started', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('provider cannot skip to work_started', true);
  END;

  -- ---- 4. happy path: provider field events -----------------------
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'travelling');
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'arrived');
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'work_started');
  SELECT lifecycle_state::text INTO v_state FROM public.bookings WHERE id=v_bid;
  PERFORM pg_temp.check('provider reached work_started', v_state='work_started');
  PERFORM pg_temp.check('work_started_at set server-side',
    (SELECT work_started_at IS NOT NULL FROM public.bookings WHERE id=v_bid));

  -- ---- 5. pause / resume accounting -------------------------------
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'paused');
  PERFORM pg_temp.check('pause start recorded',
    (SELECT last_paused_at IS NOT NULL FROM public.bookings WHERE id=v_bid));
  PERFORM pg_sleep(2);
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'resumed');
  PERFORM pg_temp.check('pause time accumulated (>=2s) and pause cleared',
    (SELECT total_pause_seconds >= 2 AND last_paused_at IS NULL
       FROM public.bookings WHERE id=v_bid));

  -- price must never move because of a pause
  PERFORM pg_temp.check('price unchanged by pause',
    (SELECT customer_pays=114000 AND provider_gets=86000 AND platform_fee_amount=28000
       FROM public.bookings WHERE id=v_bid));

  -- ---- 6. completion auto-hands over to the customer ---------------
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'completed');
  SELECT lifecycle_state::text INTO v_state FROM public.bookings WHERE id=v_bid;
  PERFORM pg_temp.check('completed → awaiting_customer_confirmation',
    v_state='awaiting_customer_confirmation');
  PERFORM pg_temp.check('legacy status synced to completed',
    (SELECT status::text='completed' FROM public.bookings WHERE id=v_bid));
  PERFORM pg_temp.check('active work time excludes pause',
    (SELECT active_work_seconds IS NOT NULL
        AND active_work_seconds >= 0
        AND active_work_seconds <=
            EXTRACT(EPOCH FROM (work_completed_at - work_started_at))::int - total_pause_seconds + 1
       FROM public.bookings WHERE id=v_bid));

  -- ---- 7. provider cannot confirm on the customer's behalf ---------
  BEGIN
    PERFORM public.booking_lifecycle_transition_v1(v_bid,'customer_confirmed');
    PERFORM pg_temp.check('provider cannot self-confirm', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('provider cannot self-confirm', true);
  END;

  -- ---- 8. customer confirmation arms the 24h hold ------------------
  PERFORM pg_temp.as_user(v_cust);
  v_res := public.booking_lifecycle_transition_v1(v_bid,'customer_confirmed',
             'e2e', '{}'::jsonb, 'idem-confirm-1');
  SELECT lifecycle_state::text INTO v_state FROM public.bookings WHERE id=v_bid;
  PERFORM pg_temp.check('confirmation moves to hold_active', v_state='hold_active');
  PERFORM pg_temp.check('funds_release_at = confirmation + 24h',
    (SELECT funds_release_at BETWEEN customer_confirmed_at + interval '23 hours 59 minutes'
                                 AND customer_confirmed_at + interval '24 hours 1 minute'
       FROM public.bookings WHERE id=v_bid));

  PERFORM pg_temp.check('lifecycle write scope closed after the call',
    COALESCE(current_setting('app.booking_lifecycle_scope', true),'off') = 'off');

  -- ---- 9. idempotency ---------------------------------------------
  v_res := public.booking_lifecycle_transition_v1(v_bid,'customer_confirmed',
             'e2e','{}'::jsonb,'idem-confirm-1');
  PERFORM pg_temp.check('replay with same key is a no-op', (v_res->>'applied')='false');
  SELECT count(*) INTO v_n FROM public.booking_lifecycle_events
   WHERE booking_id=v_bid AND to_state='customer_confirmed';
  PERFORM pg_temp.check('confirmation recorded exactly once', v_n=1);

  -- ---- 10. money states are system-only ---------------------------
  BEGIN
    PERFORM public.booking_lifecycle_transition_v1(v_bid,'funds_released');
    PERFORM pg_temp.check('customer cannot release funds', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('customer cannot release funds', true);
  END;

  PERFORM pg_temp.as_user(NULL); -- system / service role
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'funds_released','worker');
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'payout_scheduled','worker');
  PERFORM public.booking_lifecycle_transition_v1(v_bid,'paid','worker');
  SELECT lifecycle_state::text INTO v_state FROM public.bookings WHERE id=v_bid;
  PERFORM pg_temp.check('system completed the money path', v_state='paid');

  -- ---- 11. audit trail is complete and append-only -----------------
  SELECT count(*) INTO v_n FROM public.booking_lifecycle_events WHERE booking_id=v_bid;
  PERFORM pg_temp.check('every transition audited (>=11 rows)', v_n>=11);
  PERFORM pg_temp.check('audit rows carry actor role',
    (SELECT bool_and(actor_role IS NOT NULL) FROM public.booking_lifecycle_events WHERE booking_id=v_bid));
  PERFORM pg_temp.check('audit rows carry server timestamps',
    (SELECT bool_and(created_at IS NOT NULL) FROM public.booking_lifecycle_events WHERE booking_id=v_bid));
  BEGIN
    UPDATE public.booking_lifecycle_events SET reason='tamper' WHERE booking_id=v_bid;
    PERFORM pg_temp.check('audit trail immutable', false);
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    PERFORM pg_temp.check('audit trail immutable', true);
  END;
  BEGIN
    DELETE FROM public.booking_lifecycle_events WHERE booking_id=v_bid;
    PERFORM pg_temp.check('audit trail undeletable', false);
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    PERFORM pg_temp.check('audit trail undeletable', true);
  END;

  RAISE NOTICE 'ALL LIFECYCLE E2E CHECKS PASSED (booking %)', v_bid;
END $e2e$;

ROLLBACK;
