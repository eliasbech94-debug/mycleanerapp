-- =============================================================================
-- Funds Release v7 — Step 5 (M-09)
-- booking_holds + release_eligibility_decisions + eligibility engine RPCs.
-- Reconstructed from production (not previously committed under supabase/migrations/).
-- Rollback safety: any self-tests use PL/pgSQL BEGIN...EXCEPTION
-- subtransactions, so on any raised exception writes are rolled back and a
-- clean database receives ZERO persistent test rows.
-- funds_release.enabled remains false throughout M-01..M-09 and is written
-- as false (never true) in M-10.
-- =============================================================================
BEGIN;


CREATE TABLE public.booking_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    hold_type public.booking_hold_type NOT NULL,
    status public.booking_hold_status DEFAULT 'active'::public.booking_hold_status NOT NULL,
    reason text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_by_role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    released_by uuid,
    released_by_role text,
    released_at timestamp with time zone,
    release_note text
);

CREATE TABLE public.release_eligibility_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    provider_user_id uuid,
    evaluator_user_id uuid,
    evaluator_role text,
    decision text NOT NULL,
    failed_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    provider_readiness jsonb DEFAULT '{}'::jsonb NOT NULL,
    booking_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    hold_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    scheduled_release_at timestamp with time zone,
    remaining_hold_seconds bigint,
    engine_version text DEFAULT 'v7.step5.1'::text NOT NULL,
    evaluated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT release_eligibility_decisions_decision_check CHECK ((decision = ANY (ARRAY['eligible'::text, 'not_eligible'::text, 'blocked'::text])))
);

ALTER TABLE ONLY public.booking_holds
    ADD CONSTRAINT booking_holds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.release_eligibility_decisions
    ADD CONSTRAINT release_eligibility_decisions_pkey PRIMARY KEY (id);

CREATE INDEX idx_booking_holds_booking_active ON public.booking_holds USING btree (booking_id) WHERE (status = 'active'::public.booking_hold_status);

CREATE INDEX idx_booking_holds_type ON public.booking_holds USING btree (hold_type, status);

CREATE INDEX idx_red_booking ON public.release_eligibility_decisions USING btree (booking_id, evaluated_at DESC);

CREATE INDEX idx_red_decision ON public.release_eligibility_decisions USING btree (decision, evaluated_at DESC);

CREATE INDEX idx_red_provider ON public.release_eligibility_decisions USING btree (provider_user_id, evaluated_at DESC);

CREATE TRIGGER trg_red_no_update BEFORE UPDATE ON public.release_eligibility_decisions FOR EACH ROW EXECUTE FUNCTION public.reject_release_decision_mutation();

ALTER TABLE ONLY public.booking_holds
    ADD CONSTRAINT booking_holds_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.release_eligibility_decisions
    ADD CONSTRAINT release_eligibility_decisions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;

ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY holds_admin_read ON public.booking_holds FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = booking_holds.booking_id) AND ((b.customer_user_id = auth.uid()) OR (b.provider_id = (auth.uid())::text)))))));

CREATE POLICY holds_no_direct_write ON public.booking_holds TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY red_admin_read ON public.release_eligibility_decisions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'support'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = release_eligibility_decisions.booking_id) AND (b.provider_id = (auth.uid())::text))))));

CREATE POLICY red_no_direct_write ON public.release_eligibility_decisions TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.release_eligibility_decisions ENABLE ROW LEVEL SECURITY;


CREATE TRIGGER trg_red_no_update BEFORE UPDATE ON public.release_eligibility_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_release_decision_mutation();

-- Grants ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.booking_holds                 TO service_role;
GRANT SELECT, INSERT         ON public.release_eligibility_decisions TO service_role;

CREATE OR REPLACE FUNCTION public.check_provider_payout_readiness_v1(p_provider_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_profile RECORD; v_trust RECORD; v_reasons JSONB := '[]'::jsonb; v_ready BOOLEAN := true;
BEGIN
  SELECT * INTO v_profile FROM public.provider_profiles WHERE user_id=p_provider_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready',false,'provider_user_id',p_provider_user_id,
      'reasons', jsonb_build_array(jsonb_build_object('code','PROVIDER_PROFILE_MISSING','severity','fatal')));
  END IF;
  SELECT * INTO v_trust FROM public.provider_trust WHERE provider_user_id=p_provider_user_id;
  IF v_profile.status='suspended' THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_SUSPENDED','severity','blocking'); END IF;
  IF v_profile.status IN ('rejected','archived') THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_INACTIVE','severity','blocking','meta',jsonb_build_object('status',v_profile.status)); END IF;
  IF v_profile.payout_frozen IS TRUE THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_PAYOUT_FROZEN','severity','blocking','meta',jsonb_build_object('reason',v_profile.payout_frozen_reason)); END IF;
  IF v_trust.stripe_account_id IS NULL THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_NOT_STRIPE_CONNECTED','severity','blocking'); END IF;
  IF COALESCE(v_profile.stripe_charges_enabled,false)=false THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_CHARGES_DISABLED','severity','blocking'); END IF;
  IF COALESCE(v_profile.stripe_payouts_enabled,false)=false THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_PAYOUTS_DISABLED','severity','blocking'); END IF;
  IF COALESCE(v_profile.stripe_details_submitted,false)=false THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_KYC_INCOMPLETE','severity','blocking'); END IF;
  IF v_profile.stripe_disabled_reason IS NOT NULL THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_STRIPE_DISABLED','severity','blocking','meta',jsonb_build_object('reason',v_profile.stripe_disabled_reason)); END IF;
  IF v_profile.stripe_requirements_due IS NOT NULL AND array_length(v_profile.stripe_requirements_due,1)>0 THEN v_ready:=false;
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_REQUIREMENTS_DUE','severity','blocking','meta',jsonb_build_object('due',to_jsonb(v_profile.stripe_requirements_due))); END IF;
  RETURN jsonb_build_object('ready',v_ready,'provider_user_id',p_provider_user_id,
    'stripe_account_id',v_trust.stripe_account_id,'status',v_profile.status,
    'charges_enabled',COALESCE(v_profile.stripe_charges_enabled,false),
    'payouts_enabled',COALESCE(v_profile.stripe_payouts_enabled,false),
    'details_submitted',COALESCE(v_profile.stripe_details_submitted,false),
    'payout_frozen',COALESCE(v_profile.payout_frozen,false),'reasons',v_reasons);
END $function$
;

CREATE OR REPLACE FUNCTION public.evaluate_booking_release_eligibility_v1(p_booking_id uuid, p_evaluator_user_id uuid DEFAULT NULL::uuid, p_evaluator_role text DEFAULT 'system'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b RECORD; v_provider_uid UUID; v_readiness JSONB;
  v_reasons JSONB := '[]'::jsonb; v_holds JSONB := '[]'::jsonb; v_hold RECORD;
  v_decision TEXT; v_release_at TIMESTAMPTZ; v_now TIMESTAMPTZ := now();
  v_remaining BIGINT; v_captured_gross BIGINT; v_refunded_gross BIGINT;
  v_has_manual_block BOOLEAN := false;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id=p_booking_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0002'; END IF;
  BEGIN v_provider_uid := v_b.provider_id::uuid;
  EXCEPTION WHEN others THEN v_provider_uid := NULL; END;

  IF v_b.status='cancelled' THEN
    v_reasons := v_reasons || jsonb_build_object('code','BOOKING_CANCELLED','severity','blocking'); END IF;
  IF v_b.payout_status='transferred' THEN
    v_reasons := v_reasons || jsonb_build_object('code','ALREADY_TRANSFERRED','severity','blocking'); END IF;
  IF EXISTS (SELECT 1 FROM public.payout_transfer_attempts
             WHERE booking_id=p_booking_id AND state IN ('succeeded','completed')) THEN
    v_reasons := v_reasons || jsonb_build_object('code','TRANSFER_ATTEMPT_SUCCEEDED','severity','blocking'); END IF;
  IF v_b.payout_status IN ('settled_no_transfer','frozen') THEN
    v_reasons := v_reasons || jsonb_build_object('code','PAYOUT_STATUS_TERMINAL','severity','blocking','meta',jsonb_build_object('payout_status',v_b.payout_status)); END IF;

  IF v_b.status<>'completed' THEN
    v_reasons := v_reasons || jsonb_build_object('code','BOOKING_NOT_COMPLETED','severity','pending','meta',jsonb_build_object('status',v_b.status)); END IF;

  IF v_b.funds_release_at IS NULL THEN
    v_reasons := v_reasons || jsonb_build_object('code','FUNDS_RELEASE_AT_MISSING','severity','pending');
    v_release_at := NULL;
  ELSE
    v_release_at := v_b.funds_release_at;
    IF v_release_at > v_now THEN
      v_remaining := EXTRACT(EPOCH FROM (v_release_at - v_now))::bigint;
      v_reasons := v_reasons || jsonb_build_object('code','HOLD_NOT_ELAPSED','severity','pending',
        'meta',jsonb_build_object('funds_release_at',v_release_at,'remaining_seconds',v_remaining));
    ELSE v_remaining := 0; END IF;
  END IF;

  IF v_b.payment_status IS DISTINCT FROM 'captured' THEN
    v_reasons := v_reasons || jsonb_build_object('code','PAYMENT_NOT_CAPTURED','severity','pending','meta',jsonb_build_object('payment_status',v_b.payment_status)); END IF;
  IF v_b.payment_flow_version IS DISTINCT FROM 'separate_charges_v1' THEN
    v_reasons := v_reasons || jsonb_build_object('code','PAYMENT_FLOW_INCOMPATIBLE','severity','blocking','meta',jsonb_build_object('flow',v_b.payment_flow_version)); END IF;

  v_captured_gross := COALESCE(public.get_booking_captured_gross_minor_v1(p_booking_id),0);
  v_refunded_gross := COALESCE(public.get_booking_refunded_gross_minor_v1(p_booking_id),0);
  IF v_refunded_gross >= v_captured_gross AND v_captured_gross>0 THEN
    v_reasons := v_reasons || jsonb_build_object('code','FULLY_REFUNDED','severity','blocking');
  ELSIF v_refunded_gross>0 THEN
    v_reasons := v_reasons || jsonb_build_object('code','PARTIAL_REFUND_RECORDED','severity','pending','meta',jsonb_build_object('refunded_minor',v_refunded_gross));
  END IF;

  IF EXISTS (SELECT 1 FROM public.refund_requests_v2
             WHERE booking_id=p_booking_id AND status IN ('pending','approved','processing')) THEN
    v_reasons := v_reasons || jsonb_build_object('code','PENDING_REFUND_REQUEST','severity','pending'); END IF;

  IF EXISTS (SELECT 1 FROM public.stripe_disputes
             WHERE booking_id=p_booking_id
               AND (status NOT IN ('won','warning_closed','lost','charge_refunded')
                    OR (funds_withdrawn_at IS NOT NULL AND funds_reinstated_at IS NULL))) THEN
    v_reasons := v_reasons || jsonb_build_object('code','ACTIVE_DISPUTE','severity','blocking'); END IF;

  FOR v_hold IN
    SELECT * FROM public.booking_holds
    WHERE booking_id=p_booking_id AND status='active'
      AND (expires_at IS NULL OR expires_at>v_now)
  LOOP
    v_holds := v_holds || jsonb_build_object('id',v_hold.id,'type',v_hold.hold_type,
      'reason',v_hold.reason,'created_at',v_hold.created_at,'expires_at',v_hold.expires_at);
    IF v_hold.hold_type='admin_block' THEN
      v_has_manual_block := true;
      v_reasons := v_reasons || jsonb_build_object('code','ADMIN_BLOCKED','severity','blocking','meta',jsonb_build_object('hold_id',v_hold.id));
    ELSE
      v_reasons := v_reasons || jsonb_build_object(
        'code', upper(v_hold.hold_type::text)||'_HOLD_ACTIVE',
        'severity','blocking','meta',jsonb_build_object('hold_id',v_hold.id));
    END IF;
  END LOOP;

  IF v_provider_uid IS NULL THEN
    v_readiness := jsonb_build_object('ready',false,
      'reasons', jsonb_build_array(jsonb_build_object('code','PROVIDER_ID_UNRESOLVED','severity','blocking')));
    v_reasons := v_reasons || jsonb_build_object('code','PROVIDER_ID_UNRESOLVED','severity','blocking');
  ELSE
    v_readiness := public.check_provider_payout_readiness_v1(v_provider_uid);
    IF (v_readiness->>'ready')::boolean = false THEN
      v_reasons := v_reasons || COALESCE(v_readiness->'reasons','[]'::jsonb);
    END IF;
  END IF;

  IF v_has_manual_block
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_reasons) r
                WHERE r->>'code' IN ('ALREADY_TRANSFERRED','TRANSFER_ATTEMPT_SUCCEEDED','PAYOUT_STATUS_TERMINAL','FULLY_REFUNDED','BOOKING_CANCELLED','PAYMENT_FLOW_INCOMPATIBLE')) THEN
    v_decision := 'blocked';
  ELSIF jsonb_array_length(v_reasons)=0 THEN v_decision := 'eligible';
  ELSE v_decision := 'not_eligible'; END IF;

  INSERT INTO public.release_eligibility_decisions (
    booking_id, provider_user_id, evaluator_user_id, evaluator_role,
    decision, failed_rules, provider_readiness, booking_snapshot, hold_snapshot,
    scheduled_release_at, remaining_hold_seconds
  ) VALUES (
    p_booking_id, v_provider_uid, p_evaluator_user_id, COALESCE(p_evaluator_role,'system'),
    v_decision, v_reasons, v_readiness,
    jsonb_build_object('status',v_b.status,'payment_status',v_b.payment_status,
      'payout_status',v_b.payout_status,'payment_flow_version',v_b.payment_flow_version,
      'funds_release_at',v_b.funds_release_at,'captured_gross_minor',v_captured_gross,
      'refunded_gross_minor',v_refunded_gross,'currency',v_b.currency),
    v_holds, v_release_at, v_remaining);

  RETURN jsonb_build_object(
    'booking_id',p_booking_id,'provider_user_id',v_provider_uid,
    'decision',v_decision,'reasons',v_reasons,
    'provider_readiness',v_readiness,'active_holds',v_holds,
    'scheduled_release_at',v_release_at,'remaining_hold_seconds',v_remaining,
    'evaluated_at',v_now,'engine_version','v7.step5.1');
END $function$
;

CREATE OR REPLACE FUNCTION public.create_booking_hold_v1(p_booking_id uuid, p_hold_type booking_hold_type, p_reason text, p_actor_user_id uuid, p_actor_role text DEFAULT 'admin'::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason))=0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id=p_booking_id) THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  INSERT INTO public.booking_holds (booking_id, hold_type, reason, metadata, created_by, created_by_role, expires_at)
    VALUES (p_booking_id, p_hold_type, p_reason, COALESCE(p_metadata,'{}'::jsonb),
            p_actor_user_id, COALESCE(p_actor_role,'admin'), p_expires_at)
    RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, booking_id, new_state)
    VALUES (p_actor_user_id, COALESCE(p_actor_role,'admin'), 'booking_hold.create',
            'booking_hold', v_id::text, p_booking_id,
            jsonb_build_object('hold_type',p_hold_type,'reason',p_reason,'expires_at',p_expires_at));
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.release_booking_hold_v1(p_hold_id uuid, p_actor_user_id uuid, p_actor_role text DEFAULT 'admin'::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_hold RECORD;
BEGIN
  SELECT * INTO v_hold FROM public.booking_holds WHERE id=p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hold_not_found'; END IF;
  IF v_hold.status<>'active' THEN RAISE EXCEPTION 'hold_not_active' USING DETAIL=v_hold.status::text; END IF;
  UPDATE public.booking_holds SET status='released', released_by=p_actor_user_id,
    released_by_role=COALESCE(p_actor_role,'admin'), released_at=now(), release_note=p_note
    WHERE id=p_hold_id;
  INSERT INTO public.admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, booking_id, new_state)
    VALUES (p_actor_user_id, COALESCE(p_actor_role,'admin'), 'booking_hold.release',
            'booking_hold', p_hold_id::text, v_hold.booking_id, jsonb_build_object('note',p_note));
END $function$
;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('check_provider_payout_readiness_v1',
                        'evaluate_booking_release_eligibility_v1',
                        'create_booking_hold_v1','release_booking_hold_v1')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END $$;

-- Self-test (rollback-safe): eligibility on missing booking must raise ------
DO $selftest$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.evaluate_booking_release_eligibility_v1(
      '00000000-0000-0000-0000-000000000000'::uuid, NULL::uuid, 'selftest');
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'M-09 self-test: eligibility engine did not raise on missing booking';
  END IF;
END $selftest$;

COMMIT;
