-- =============================================================================
-- Funds Release v7 — Step 6+7 (M-10)
-- payout_audit_log + payout_authorizations + payout_transfer_attempts + workers + dual-control + rehearsal + feature flag (false).
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;


CREATE TABLE public.payout_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    provider_user_id uuid,
    actor text NOT NULL,
    action text NOT NULL,
    from_state text,
    to_state text,
    reason text,
    authorization_id uuid,
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payout_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id text NOT NULL,
    requested_by uuid NOT NULL,
    reason text NOT NULL,
    booking_id uuid,
    action text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    CONSTRAINT payout_authorizations_status_check CHECK ((status = ANY (ARRAY['issued'::text, 'consumed'::text, 'failed'::text, 'expired'::text])))
);

CREATE TABLE public.payout_transfer_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    provider_user_id uuid NOT NULL,
    attempt_scope text NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    funding_mode public.transfer_funding_mode NOT NULL,
    funding_source_ref text,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    transfer_group text NOT NULL,
    stripe_idempotency_key text NOT NULL,
    stripe_transfer_id text,
    state text DEFAULT 'planned'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error_code text,
    last_error_message text,
    eligibility_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payout_transfer_attempts_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT payout_transfer_attempts_attempt_number_check CHECK ((attempt_number >= 1)),
    CONSTRAINT payout_transfer_attempts_currency_check CHECK (((currency)::text = lower((currency)::text)))
);

ALTER TABLE ONLY public.payout_audit_log
    ADD CONSTRAINT payout_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payout_authorizations
    ADD CONSTRAINT payout_authorizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payout_authorizations
    ADD CONSTRAINT payout_authorizations_request_id_key UNIQUE (request_id);

ALTER TABLE ONLY public.payout_transfer_attempts
    ADD CONSTRAINT payout_transfer_attempts_booking_id_attempt_scope_attempt_n_key UNIQUE (booking_id, attempt_scope, attempt_number);

ALTER TABLE ONLY public.payout_transfer_attempts
    ADD CONSTRAINT payout_transfer_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payout_transfer_attempts
    ADD CONSTRAINT payout_transfer_attempts_stripe_idempotency_key_key UNIQUE (stripe_idempotency_key);

CREATE INDEX payout_audit_log_booking_idx ON public.payout_audit_log USING btree (booking_id);

CREATE INDEX payout_transfer_attempts_booking_idx ON public.payout_transfer_attempts USING btree (booking_id);

CREATE INDEX payout_transfer_attempts_state_idx ON public.payout_transfer_attempts USING btree (state);

CREATE TRIGGER payout_audit_log_no_delete BEFORE DELETE ON public.payout_audit_log FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

CREATE TRIGGER payout_audit_log_no_update BEFORE UPDATE ON public.payout_audit_log FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

ALTER TABLE ONLY public.payout_audit_log
    ADD CONSTRAINT payout_audit_log_authorization_id_fkey FOREIGN KEY (authorization_id) REFERENCES public.payout_authorizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payout_audit_log
    ADD CONSTRAINT payout_audit_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payout_audit_log
    ADD CONSTRAINT payout_audit_log_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payout_authorizations
    ADD CONSTRAINT payout_authorizations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payout_authorizations
    ADD CONSTRAINT payout_authorizations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payout_transfer_attempts
    ADD CONSTRAINT payout_transfer_attempts_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payout_transfer_attempts
    ADD CONSTRAINT payout_transfer_attempts_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.payout_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_audit_log_deny_all ON public.payout_audit_log TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.payout_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_authorizations_deny_all ON public.payout_authorizations TO authenticated, anon, service_role USING (false) WITH CHECK (false);

ALTER TABLE public.payout_transfer_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_transfer_attempts_deny_all ON public.payout_transfer_attempts TO authenticated, anon, service_role USING (false) WITH CHECK (false);


-- Append-only triggers on payout_audit_log -----------------------------------
CREATE TRIGGER payout_audit_log_no_update BEFORE UPDATE ON public.payout_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
CREATE TRIGGER payout_audit_log_no_delete BEFORE DELETE ON public.payout_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

-- Grants ---------------------------------------------------------------------
GRANT SELECT, INSERT         ON public.payout_audit_log         TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payout_authorizations    TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payout_transfer_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.funds_release_max_retries_v1()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT 5 $function$
;

CREATE OR REPLACE FUNCTION public.funds_release_reason_codes_v1()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.plan_pending_releases_v1(_limit integer DEFAULT 100, _force_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag_on boolean;
  v_dry_run boolean;
  v_booking record;
  v_eligibility jsonb;
  v_provider_uuid uuid;
  v_scanned int := 0;
  v_planned int := 0;
  v_skipped int := 0;
  v_blocked int := 0;
  v_idem text;
  v_scope text := 'release_v1';
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'plan_pending_releases_v1: caller not authorized (%)', current_setting('role', true);
  END IF;

  SELECT COALESCE(enabled, false) INTO v_flag_on
  FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';

  v_dry_run := (NOT COALESCE(v_flag_on, false)) OR _force_dry_run;
  IF NOT v_dry_run THEN
    RAISE EXCEPTION 'plan_pending_releases_v1: only dry-run mode is available in Step 6';
  END IF;

  FOR v_booking IN
    SELECT b.id, b.provider_id, b.funds_release_at
    FROM public.bookings b
    WHERE b.funds_release_at IS NOT NULL
      AND b.funds_release_at <= now()
      AND b.status IN ('completed'::public.booking_status, 'accepted'::public.booking_status)
      AND NOT EXISTS (
        SELECT 1 FROM public.payout_transfer_attempts pa
        WHERE pa.booking_id = b.id AND pa.attempt_scope = v_scope
      )
    ORDER BY b.funds_release_at ASC
    LIMIT GREATEST(_limit, 0)
  LOOP
    v_scanned := v_scanned + 1;
    BEGIN
      v_provider_uuid := v_booking.provider_id::uuid;
    EXCEPTION WHEN others THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END;
    IF v_provider_uuid IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_eligibility := public.evaluate_booking_release_eligibility_v1(
      v_booking.id, NULL, 'dry_run_worker'
    );
    IF (v_eligibility->>'decision') <> 'eligible' THEN
      v_blocked := v_blocked + 1; CONTINUE;
    END IF;

    v_idem := 'dryrun:v1:' || v_booking.id::text || ':' || v_scope;

    INSERT INTO public.payout_transfer_attempts(
      booking_id, provider_user_id, attempt_scope, attempt_number,
      funding_mode, amount_minor, currency, transfer_group,
      stripe_idempotency_key, state, eligibility_snapshot
    )
    VALUES (
      v_booking.id, v_provider_uuid, v_scope, 1,
      'separate_charges_transfers_v1'::public.transfer_funding_mode,
      COALESCE((v_eligibility->'amounts'->>'provider_net_minor')::bigint, 1),
      COALESCE(v_eligibility->>'currency', 'dkk'),
      'grp_dryrun_' || v_booking.id::text,
      v_idem,
      'dry_run_planned',
      v_eligibility
    )
    ON CONFLICT (stripe_idempotency_key) DO NOTHING;

    IF FOUND THEN v_planned := v_planned + 1;
    ELSE v_skipped := v_skipped + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', true,
    'flag_enabled', COALESCE(v_flag_on,false),
    'scanned', v_scanned,
    'planned', v_planned,
    'blocked', v_blocked,
    'skipped', v_skipped,
    'at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_provider_payout_readiness_v1(_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record; v_snapshot jsonb;
  v_checked int := 0; v_ready int := 0; v_not_ready int := 0;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'reconcile_provider_payout_readiness_v1: caller not authorized';
  END IF;

  FOR v_row IN
    SELECT user_id FROM public.provider_profiles
    ORDER BY updated_at DESC NULLS LAST
    LIMIT GREATEST(_limit, 0)
  LOOP
    v_checked := v_checked + 1;
    v_snapshot := public.check_provider_payout_readiness_v1(v_row.user_id);
    IF COALESCE((v_snapshot->>'ready')::boolean, false) THEN
      v_ready := v_ready + 1;
    ELSE
      v_not_ready := v_not_ready + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'ready', v_ready, 'not_ready', v_not_ready, 'at', now());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.funds_release_worker_tick_v1(_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_got_lock boolean; v_run_id uuid;
  v_started timestamptz := clock_timestamp();
  v_plan jsonb; v_recon jsonb; v_flag_on boolean;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'funds_release_worker_tick_v1: caller not authorized';
  END IF;

  v_got_lock := pg_try_advisory_xact_lock(hashtext('funds_release_worker_tick_v1'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'lock_busy', 'dry_run', true, 'at', now());
  END IF;

  SELECT COALESCE(enabled, false) INTO v_flag_on
  FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';

  INSERT INTO public.job_runs(job_name, status, metadata)
  VALUES ('funds_release_worker_tick_v1', 'running',
          jsonb_build_object('flag_enabled', COALESCE(v_flag_on,false), 'limit', _limit))
  RETURNING id INTO v_run_id;

  v_plan := public.plan_pending_releases_v1(_limit, true);
  v_recon := public.reconcile_provider_payout_readiness_v1(_limit);

  UPDATE public.job_runs
  SET status = 'completed', finished_at = now(),
      duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int,
      processed_count = COALESCE((v_plan->>'scanned')::int, 0),
      success_count = COALESCE((v_plan->>'planned')::int, 0),
      metadata = metadata || jsonb_build_object('plan', v_plan, 'reconcile', v_recon)
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'flag_enabled', COALESCE(v_flag_on,false),
    'dry_run', true, 'plan', v_plan, 'reconcile', v_recon
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.request_release_authorization_v1(_booking_id uuid, _request_id text, _requested_by uuid, _reason text DEFAULT 'dry_run_rehearsal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rehearse_release_attempt_v1(_authorization_id uuid, _simulate_failure_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.funds_release_rehearsal_worker_tick_v1(_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('funds_release_max_retries_v1','funds_release_reason_codes_v1',
                        'plan_pending_releases_v1','reconcile_provider_payout_readiness_v1',
                        'funds_release_worker_tick_v1','request_release_authorization_v1',
                        'rehearse_release_attempt_v1','funds_release_rehearsal_worker_tick_v1')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END $$;

-- Feature flag (created disabled, NEVER toggled true anywhere in v7 chain) ---
INSERT INTO public.feature_flags(flag_key, scope, enabled, reason)
SELECT 'funds_release.enabled','global', false,
       'v7 funds-release policy master switch. STAGING-ONLY, currently DISABLED.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE flag_key='funds_release.enabled' AND scope='global' AND target_id IS NULL
);

-- Self-test (rollback-safe): worker refuses when flag is off & unauthorized -
DO $selftest$
DECLARE v_flag boolean;
BEGIN
  SELECT enabled INTO v_flag FROM public.feature_flags
  WHERE flag_key='funds_release.enabled' AND scope='global';
  IF v_flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'M-10 self-test: funds_release.enabled must be false after this migration';
  END IF;
  -- worker refuses non-service_role callers → we do not invoke it here.
END $selftest$;

COMMIT;
