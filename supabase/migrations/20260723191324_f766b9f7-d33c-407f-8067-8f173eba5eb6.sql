
DO $guard$
DECLARE v_enabled boolean;
BEGIN
  SELECT enabled INTO v_enabled FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';
  IF v_enabled IS TRUE THEN
    RAISE EXCEPTION 'Refusing Step 7 migration: funds_release.enabled must be false';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.funds_release_reason_codes_v1()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $codes$
  SELECT jsonb_build_object(
    'AUTHORIZED_DRY_RUN','Authorization issued in dry-run mode',
    'REHEARSED_DRY_RUN','Rehearsal completed without Stripe call',
    'BLOCKED_FLAG_OFF','funds_release.enabled is false — executable paths disabled',
    'BLOCKED_NOT_ELIGIBLE','Eligibility engine rejected the booking',
    'BLOCKED_ACTIVE_HOLD','Active booking hold present',
    'BLOCKED_DISPUTE_OPEN','Open Stripe dispute present',
    'BLOCKED_REFUND_PENDING','Pending or partial refund present',
    'BLOCKED_CANCELLED','Booking is cancelled',
    'BLOCKED_PROVIDER_UNREADY','Provider payout readiness check failed',
    'BLOCKED_INSUFFICIENT_CAPACITY','Source-linked capacity insufficient',
    'BLOCKED_ATTEMPT_MISSING','No dry-run planned attempt exists for booking',
    'BLOCKED_ATTEMPT_STATE','Attempt is in an incompatible state',
    'BLOCKED_RETRY_LIMIT','Retry ceiling reached',
    'BLOCKED_AUTH_EXPIRED','Authorization expired before rehearsal',
    'BLOCKED_AUTH_CONSUMED','Authorization already consumed',
    'BLOCKED_AUTH_MISMATCH','Authorization does not match target booking/attempt',
    'BLOCKED_CONCURRENT_REHEARSAL','Another rehearsal is in progress for this booking',
    'BLOCKED_SIMULATED_FAILURE','Rehearsal aborted by explicit simulate_failure_code',
    'BLOCKED_UNAUTHORIZED','Caller not service_role'
  );
$codes$;
REVOKE ALL ON FUNCTION public.funds_release_reason_codes_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funds_release_reason_codes_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.funds_release_max_retries_v1()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;
REVOKE ALL ON FUNCTION public.funds_release_max_retries_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funds_release_max_retries_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.request_release_authorization_v1(
  _booking_id uuid, _request_id text, _requested_by uuid, _reason text DEFAULT 'dry_run_rehearsal'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_flag_on boolean; v_attempt record; v_eligibility jsonb; v_readiness jsonb;
  v_capacity jsonb; v_authz record; v_existing record;
  v_reason_code text; v_amount bigint; v_currency text; v_provider uuid;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'request_release_authorization_v1: BLOCKED_UNAUTHORIZED (role=%)', current_setting('role', true);
  END IF;
  IF _booking_id IS NULL OR _request_id IS NULL OR _requested_by IS NULL THEN
    RAISE EXCEPTION 'request_release_authorization_v1: booking_id/request_id/requested_by required';
  END IF;

  SELECT * INTO v_existing FROM public.payout_authorizations WHERE request_id = _request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('idempotent', true, 'authorization_id', v_existing.id,
      'status', v_existing.status, 'booking_id', v_existing.booking_id,
      'reason_code','AUTHORIZED_DRY_RUN');
  END IF;

  SELECT COALESCE(enabled,false) INTO v_flag_on FROM public.feature_flags
  WHERE flag_key='funds_release.enabled' AND scope='global';
  IF v_flag_on IS TRUE THEN
    v_reason_code := 'BLOCKED_FLAG_OFF';
    INSERT INTO public.payout_audit_log(booking_id, actor, action, reason, detail)
    VALUES (_booking_id,'step7_worker','authorize.refuse', v_reason_code,
            jsonb_build_object('request_id', _request_id));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  SELECT * INTO v_attempt FROM public.payout_transfer_attempts
  WHERE booking_id = _booking_id AND attempt_scope='release_v1'
  ORDER BY attempt_number DESC LIMIT 1;
  IF NOT FOUND THEN
    v_reason_code := 'BLOCKED_ATTEMPT_MISSING';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,detail)
    VALUES (_booking_id,'step7_worker','authorize.refuse', v_reason_code,
            jsonb_build_object('request_id', _request_id));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  IF v_attempt.state NOT IN ('dry_run_planned','dry_run_authorized') THEN
    v_reason_code := 'BLOCKED_ATTEMPT_STATE';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,from_state,reason,detail)
    VALUES (_booking_id,'step7_worker','authorize.refuse', v_attempt.state, v_reason_code,
            jsonb_build_object('request_id', _request_id));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code, 'attempt_state', v_attempt.state);
  END IF;

  IF v_attempt.retry_count >= public.funds_release_max_retries_v1() THEN
    v_reason_code := 'BLOCKED_RETRY_LIMIT';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,detail)
    VALUES (_booking_id,'step7_worker','authorize.refuse', v_reason_code,
            jsonb_build_object('request_id', _request_id, 'retry_count', v_attempt.retry_count));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  v_provider := v_attempt.provider_user_id;
  v_amount   := v_attempt.amount_minor;
  v_currency := v_attempt.currency;

  v_eligibility := public.evaluate_booking_release_eligibility_v1(_booking_id, NULL, 'step7_authorize');
  IF (v_eligibility->>'decision') <> 'eligible' THEN
    v_reason_code := CASE COALESCE(v_eligibility->>'reason','')
      WHEN 'active_hold' THEN 'BLOCKED_ACTIVE_HOLD'
      WHEN 'dispute_open' THEN 'BLOCKED_DISPUTE_OPEN'
      WHEN 'refund_pending' THEN 'BLOCKED_REFUND_PENDING'
      WHEN 'cancelled' THEN 'BLOCKED_CANCELLED'
      ELSE 'BLOCKED_NOT_ELIGIBLE' END;
    INSERT INTO public.payout_audit_log(booking_id,provider_user_id,actor,action,reason,detail)
    VALUES (_booking_id,v_provider,'step7_worker','authorize.refuse', v_reason_code,
            jsonb_build_object('request_id', _request_id, 'eligibility', v_eligibility));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code, 'eligibility', v_eligibility);
  END IF;

  v_readiness := public.check_provider_payout_readiness_v1(v_provider);
  IF NOT COALESCE((v_readiness->>'ready')::boolean, false) THEN
    v_reason_code := 'BLOCKED_PROVIDER_UNREADY';
    INSERT INTO public.payout_audit_log(booking_id,provider_user_id,actor,action,reason,detail)
    VALUES (_booking_id,v_provider,'step7_worker','authorize.refuse', v_reason_code,
            jsonb_build_object('request_id', _request_id, 'readiness', v_readiness));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code, 'readiness', v_readiness);
  END IF;

  BEGIN
    v_capacity := public.get_source_transfer_capacity_v1(_booking_id);
  EXCEPTION WHEN others THEN
    v_capacity := jsonb_build_object('available_minor', 0, 'error', SQLERRM);
  END;
  IF COALESCE((v_capacity->>'available_minor')::bigint, 0) < v_amount THEN
    v_reason_code := 'BLOCKED_INSUFFICIENT_CAPACITY';
    INSERT INTO public.payout_audit_log(booking_id,provider_user_id,actor,action,reason,detail)
    VALUES (_booking_id,v_provider,'step7_worker','authorize.refuse', v_reason_code,
            jsonb_build_object('request_id', _request_id, 'capacity', v_capacity, 'required_minor', v_amount));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code, 'capacity', v_capacity);
  END IF;

  INSERT INTO public.payout_authorizations(
    request_id, requested_by, reason, booking_id, action, payload, status, expires_at
  ) VALUES (
    _request_id, _requested_by, _reason, _booking_id, 'release_v1_dry_run',
    jsonb_build_object('attempt_id', v_attempt.id, 'amount_minor', v_amount,
      'currency', v_currency, 'provider_user_id', v_provider,
      'eligibility', v_eligibility, 'readiness', v_readiness, 'capacity', v_capacity,
      'flag_enabled', v_flag_on),
    'issued', now() + interval '15 minutes'
  ) RETURNING * INTO v_authz;

  UPDATE public.payout_transfer_attempts
  SET state='dry_run_authorized', updated_at=now(), eligibility_snapshot=v_eligibility
  WHERE id = v_attempt.id;

  INSERT INTO public.payout_audit_log(
    booking_id,provider_user_id,actor,action,from_state,to_state,reason,authorization_id,detail
  ) VALUES (_booking_id, v_provider,'step7_worker','authorize.issue',
    v_attempt.state,'dry_run_authorized','AUTHORIZED_DRY_RUN', v_authz.id,
    jsonb_build_object('request_id', _request_id, 'expires_at', v_authz.expires_at));

  RETURN jsonb_build_object('ok', true, 'reason_code','AUTHORIZED_DRY_RUN',
    'authorization_id', v_authz.id, 'attempt_id', v_attempt.id,
    'expires_at', v_authz.expires_at, 'dry_run', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.request_release_authorization_v1(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_release_authorization_v1(uuid, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rehearse_release_attempt_v1(
  _authorization_id uuid, _simulate_failure_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_flag_on boolean; v_authz record; v_attempt record;
  v_got_lock boolean; v_reason_code text;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'rehearse_release_attempt_v1: BLOCKED_UNAUTHORIZED (role=%)', current_setting('role', true);
  END IF;
  IF _authorization_id IS NULL THEN
    RAISE EXCEPTION 'rehearse_release_attempt_v1: authorization_id required';
  END IF;

  SELECT COALESCE(enabled,false) INTO v_flag_on FROM public.feature_flags
  WHERE flag_key='funds_release.enabled' AND scope='global';
  IF v_flag_on IS TRUE THEN
    v_reason_code := 'BLOCKED_FLAG_OFF';
    INSERT INTO public.payout_audit_log(actor,action,reason,authorization_id,detail)
    VALUES ('step7_worker','rehearse.refuse', v_reason_code, _authorization_id,
            jsonb_build_object('note','executable path is not permitted in Step 7'));
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  SELECT * INTO v_authz FROM public.payout_authorizations WHERE id = _authorization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rehearse_release_attempt_v1: authorization % not found', _authorization_id;
  END IF;

  IF v_authz.status = 'consumed' THEN
    v_reason_code := 'BLOCKED_AUTH_CONSUMED';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,authorization_id)
    VALUES (v_authz.booking_id,'step7_worker','rehearse.refuse', v_reason_code, v_authz.id);
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  IF v_authz.status = 'expired' OR v_authz.expires_at < now() THEN
    UPDATE public.payout_authorizations SET status='expired' WHERE id=v_authz.id AND status='issued';
    v_reason_code := 'BLOCKED_AUTH_EXPIRED';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,authorization_id)
    VALUES (v_authz.booking_id,'step7_worker','rehearse.refuse', v_reason_code, v_authz.id);
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  v_got_lock := pg_try_advisory_xact_lock(hashtext('rel:'||v_authz.booking_id::text));
  IF NOT v_got_lock THEN
    v_reason_code := 'BLOCKED_CONCURRENT_REHEARSAL';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,authorization_id)
    VALUES (v_authz.booking_id,'step7_worker','rehearse.refuse', v_reason_code, v_authz.id);
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  SELECT * INTO v_attempt FROM public.payout_transfer_attempts
  WHERE id = (v_authz.payload->>'attempt_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    v_reason_code := 'BLOCKED_ATTEMPT_MISSING';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,authorization_id)
    VALUES (v_authz.booking_id,'step7_worker','rehearse.refuse', v_reason_code, v_authz.id);
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  IF v_attempt.booking_id <> v_authz.booking_id THEN
    v_reason_code := 'BLOCKED_AUTH_MISMATCH';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,reason,authorization_id)
    VALUES (v_authz.booking_id,'step7_worker','rehearse.refuse', v_reason_code, v_authz.id);
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code);
  END IF;

  IF v_attempt.state <> 'dry_run_authorized' THEN
    v_reason_code := 'BLOCKED_ATTEMPT_STATE';
    INSERT INTO public.payout_audit_log(booking_id,actor,action,from_state,reason,authorization_id)
    VALUES (v_authz.booking_id,'step7_worker','rehearse.refuse', v_attempt.state, v_reason_code, v_authz.id);
    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code, 'attempt_state', v_attempt.state);
  END IF;

  IF _simulate_failure_code IS NOT NULL THEN
    v_reason_code := 'BLOCKED_SIMULATED_FAILURE';
    UPDATE public.payout_transfer_attempts
    SET retry_count = retry_count + 1, last_error_code = _simulate_failure_code,
        last_error_message = 'Simulated failure during Step 7 rehearsal',
        state = 'dry_run_planned', updated_at = now()
    WHERE id = v_attempt.id;

    UPDATE public.payout_authorizations SET status='failed', consumed_at=now()
    WHERE id = v_authz.id;

    INSERT INTO public.payout_audit_log(
      booking_id,provider_user_id,actor,action,from_state,to_state,reason,authorization_id,detail
    ) VALUES (v_authz.booking_id, v_attempt.provider_user_id,'step7_worker',
      'rehearse.simulate_failure','dry_run_authorized','dry_run_planned',
      v_reason_code, v_authz.id, jsonb_build_object('failure_code', _simulate_failure_code));

    RETURN jsonb_build_object('ok', false, 'reason_code', v_reason_code,
      'simulated_failure_code', _simulate_failure_code,
      'attempt_state', 'dry_run_planned', 'retry_count', v_attempt.retry_count + 1);
  END IF;

  UPDATE public.payout_transfer_attempts
  SET state='dry_run_rehearsed', updated_at=now() WHERE id = v_attempt.id;

  UPDATE public.payout_authorizations
  SET status='consumed', consumed_at=now() WHERE id = v_authz.id;

  INSERT INTO public.payout_audit_log(
    booking_id,provider_user_id,actor,action,from_state,to_state,reason,authorization_id,detail
  ) VALUES (v_authz.booking_id, v_attempt.provider_user_id,'step7_worker',
    'rehearse.complete','dry_run_authorized','dry_run_rehearsed',
    'REHEARSED_DRY_RUN', v_authz.id,
    jsonb_build_object('amount_minor', v_attempt.amount_minor, 'currency', v_attempt.currency));

  RETURN jsonb_build_object('ok', true, 'reason_code','REHEARSED_DRY_RUN', 'dry_run', true,
    'attempt_id', v_attempt.id, 'authorization_id', v_authz.id,
    'amount_minor', v_attempt.amount_minor, 'currency', v_attempt.currency);
END;
$fn$;
REVOKE ALL ON FUNCTION public.rehearse_release_attempt_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rehearse_release_attempt_v1(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.funds_release_rehearsal_worker_tick_v1(_limit int DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_got_lock boolean; v_run_id uuid;
  v_started timestamptz := clock_timestamp();
  v_flag_on boolean; v_row record; v_req_id text;
  v_authz jsonb; v_rehearsal jsonb;
  v_scanned int := 0; v_authorized int := 0; v_rehearsed int := 0;
  v_blocked int := 0; v_errors int := 0;
  v_reasons jsonb := '{}'::jsonb; v_key text;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'funds_release_rehearsal_worker_tick_v1: BLOCKED_UNAUTHORIZED';
  END IF;

  v_got_lock := pg_try_advisory_xact_lock(hashtext('funds_release_rehearsal_worker_tick_v1'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('skipped', true, 'reason','lock_busy', 'dry_run', true, 'at', now());
  END IF;

  SELECT COALESCE(enabled,false) INTO v_flag_on FROM public.feature_flags
  WHERE flag_key='funds_release.enabled' AND scope='global';

  INSERT INTO public.job_runs(job_name, status, metadata)
  VALUES ('funds_release_rehearsal_worker_tick_v1','running',
          jsonb_build_object('flag_enabled', v_flag_on, 'limit', _limit))
  RETURNING id INTO v_run_id;

  FOR v_row IN
    SELECT id, booking_id, provider_user_id
    FROM public.payout_transfer_attempts
    WHERE state='dry_run_planned'
      AND retry_count < public.funds_release_max_retries_v1()
    ORDER BY updated_at ASC LIMIT GREATEST(_limit, 0)
  LOOP
    v_scanned := v_scanned + 1;
    v_req_id := 'step7:'||v_row.booking_id::text||':'||to_char(now(),'YYYYMMDDHH24MISS');

    BEGIN
      v_authz := public.request_release_authorization_v1(
        v_row.booking_id, v_req_id, v_row.provider_user_id, 'dry_run_rehearsal');
    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1; CONTINUE;
    END;

    IF NOT COALESCE((v_authz->>'ok')::boolean, (v_authz->>'idempotent')::boolean, false) THEN
      v_blocked := v_blocked + 1;
      v_key := COALESCE(v_authz->>'reason_code','UNKNOWN');
      v_reasons := jsonb_set(v_reasons, ARRAY[v_key],
                             to_jsonb(COALESCE((v_reasons->>v_key)::int,0)+1));
      CONTINUE;
    END IF;
    v_authorized := v_authorized + 1;

    BEGIN
      v_rehearsal := public.rehearse_release_attempt_v1(
        (v_authz->>'authorization_id')::uuid, NULL);
    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1; CONTINUE;
    END;

    IF COALESCE((v_rehearsal->>'ok')::boolean, false) THEN
      v_rehearsed := v_rehearsed + 1;
    ELSE
      v_blocked := v_blocked + 1;
      v_key := COALESCE(v_rehearsal->>'reason_code','UNKNOWN');
      v_reasons := jsonb_set(v_reasons, ARRAY[v_key],
                             to_jsonb(COALESCE((v_reasons->>v_key)::int,0)+1));
    END IF;
  END LOOP;

  UPDATE public.job_runs
  SET status='completed', finished_at=now(),
      duration_ms=(EXTRACT(EPOCH FROM (clock_timestamp()-v_started))*1000)::int,
      processed_count=v_scanned, success_count=v_rehearsed,
      metadata = metadata || jsonb_build_object(
        'scanned', v_scanned, 'authorized', v_authorized, 'rehearsed', v_rehearsed,
        'blocked', v_blocked, 'errors', v_errors, 'reasons', v_reasons, 'dry_run', true)
  WHERE id = v_run_id;

  RETURN jsonb_build_object('run_id', v_run_id, 'dry_run', true, 'flag_enabled', v_flag_on,
    'scanned', v_scanned, 'authorized', v_authorized, 'rehearsed', v_rehearsed,
    'blocked', v_blocked, 'errors', v_errors, 'reasons', v_reasons);
END;
$fn$;
REVOKE ALL ON FUNCTION public.funds_release_rehearsal_worker_tick_v1(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funds_release_rehearsal_worker_tick_v1(int) TO service_role;

DO $tests$
DECLARE v_flag boolean; v_priv int; v_res jsonb; v_codes jsonb;
BEGIN
  SELECT enabled INTO v_flag FROM public.feature_flags
  WHERE flag_key='funds_release.enabled' AND scope='global';
  IF v_flag IS TRUE THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: funds_release.enabled must not be true';
  END IF;

  SELECT count(*) INTO v_priv
  FROM information_schema.role_routine_grants
  WHERE routine_schema='public'
    AND routine_name IN (
      'request_release_authorization_v1','rehearse_release_attempt_v1',
      'funds_release_rehearsal_worker_tick_v1',
      'funds_release_reason_codes_v1','funds_release_max_retries_v1')
    AND grantee IN ('anon','authenticated','PUBLIC');
  IF v_priv > 0 THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: Step 7 functions leaked % grants', v_priv;
  END IF;

  v_codes := public.funds_release_reason_codes_v1();
  IF (v_codes->>'AUTHORIZED_DRY_RUN') IS NULL
     OR (v_codes->>'REHEARSED_DRY_RUN') IS NULL
     OR (v_codes->>'BLOCKED_INSUFFICIENT_CAPACITY') IS NULL THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: reason code catalogue incomplete';
  END IF;

  v_res := public.funds_release_rehearsal_worker_tick_v1(5);
  IF v_res->>'dry_run' <> 'true' THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: worker tick not dry_run: %', v_res;
  END IF;
  v_res := public.funds_release_rehearsal_worker_tick_v1(5);
  IF v_res->>'dry_run' <> 'true' THEN
    RAISE EXCEPTION 'SELF-TEST FAIL: 2nd worker tick not dry_run: %', v_res;
  END IF;

  RAISE NOTICE 'Step 7 self-tests passed: %', v_res;
END;
$tests$;
