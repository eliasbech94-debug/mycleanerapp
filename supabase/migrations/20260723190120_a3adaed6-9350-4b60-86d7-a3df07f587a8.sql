
DO $$ BEGIN
  CREATE TYPE public.booking_hold_type AS ENUM ('complaint','dispute','refund','cancellation','manual','admin_block');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.booking_hold_status AS ENUM ('active','released','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.booking_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  hold_type public.booking_hold_type NOT NULL,
  status public.booking_hold_status NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID, created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  released_by UUID, released_by_role TEXT,
  released_at TIMESTAMPTZ, release_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_booking_holds_booking_active
  ON public.booking_holds(booking_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_booking_holds_type
  ON public.booking_holds(hold_type, status);
GRANT SELECT ON public.booking_holds TO authenticated;
GRANT ALL ON public.booking_holds TO service_role;
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "holds_admin_read" ON public.booking_holds;
CREATE POLICY "holds_admin_read" ON public.booking_holds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=booking_holds.booking_id
      AND (b.customer_user_id=auth.uid() OR b.provider_id=auth.uid()::text)));
DROP POLICY IF EXISTS "holds_no_direct_write" ON public.booking_holds;
CREATE POLICY "holds_no_direct_write" ON public.booking_holds FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.release_eligibility_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_user_id UUID, evaluator_user_id UUID, evaluator_role TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('eligible','not_eligible','blocked')),
  failed_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
  booking_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  hold_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_release_at TIMESTAMPTZ, remaining_hold_seconds BIGINT,
  engine_version TEXT NOT NULL DEFAULT 'v7.step5.1',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_red_booking ON public.release_eligibility_decisions(booking_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_red_provider ON public.release_eligibility_decisions(provider_user_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_red_decision ON public.release_eligibility_decisions(decision, evaluated_at DESC);
GRANT SELECT ON public.release_eligibility_decisions TO authenticated;
GRANT ALL ON public.release_eligibility_decisions TO service_role;
ALTER TABLE public.release_eligibility_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "red_admin_read" ON public.release_eligibility_decisions;
CREATE POLICY "red_admin_read" ON public.release_eligibility_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=release_eligibility_decisions.booking_id
      AND b.provider_id=auth.uid()::text));
DROP POLICY IF EXISTS "red_no_direct_write" ON public.release_eligibility_decisions;
CREATE POLICY "red_no_direct_write" ON public.release_eligibility_decisions FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.reject_release_decision_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'release_eligibility_decisions is append-only'; END $$;
DROP TRIGGER IF EXISTS trg_red_no_update ON public.release_eligibility_decisions;
CREATE TRIGGER trg_red_no_update BEFORE UPDATE ON public.release_eligibility_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_release_decision_mutation();

CREATE OR REPLACE FUNCTION public.check_provider_payout_readiness_v1(p_provider_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.check_provider_payout_readiness_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_provider_payout_readiness_v1(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_booking_release_eligibility_v1(
  p_booking_id UUID, p_evaluator_user_id UUID DEFAULT NULL, p_evaluator_role TEXT DEFAULT 'system'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.evaluate_booking_release_eligibility_v1(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_booking_release_eligibility_v1(UUID,UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_booking_hold_v1(
  p_booking_id UUID, p_hold_type public.booking_hold_type, p_reason TEXT,
  p_actor_user_id UUID, p_actor_role TEXT DEFAULT 'admin',
  p_expires_at TIMESTAMPTZ DEFAULT NULL, p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.create_booking_hold_v1(UUID, public.booking_hold_type, TEXT, UUID, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_hold_v1(UUID, public.booking_hold_type, TEXT, UUID, TEXT, TIMESTAMPTZ, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.release_booking_hold_v1(
  p_hold_id UUID, p_actor_user_id UUID, p_actor_role TEXT DEFAULT 'admin', p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.release_booking_hold_v1(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_booking_hold_v1(UUID, UUID, TEXT, TEXT) TO service_role;

-- Privilege selftest
DO $$
DECLARE v_flag BOOLEAN;
BEGIN
  SELECT enabled INTO v_flag FROM public.feature_flags WHERE flag_key='funds_release.enabled' AND scope='global';
  IF COALESCE(v_flag,false) THEN RAISE EXCEPTION 'SELFTEST FAIL: flag must be OFF'; END IF;
  IF has_function_privilege('authenticated','public.evaluate_booking_release_eligibility_v1(uuid,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.evaluate_booking_release_eligibility_v1(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'SELFTEST FAIL: engine exposed'; END IF;
  IF NOT has_function_privilege('service_role','public.evaluate_booking_release_eligibility_v1(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'SELFTEST FAIL: service_role missing execute'; END IF;
  IF has_function_privilege('authenticated','public.check_provider_payout_readiness_v1(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.create_booking_hold_v1(uuid,public.booking_hold_type,text,uuid,text,timestamptz,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.release_booking_hold_v1(uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'SELFTEST FAIL: helper RPCs exposed'; END IF;
  RAISE NOTICE 'STEP 5 SELFTEST privilege matrix OK';
END $$;

-- Functional selftest — cascade delete via bookings only; audit rows kept (immutable).
DO $$
DECLARE
  v_booking UUID; v_booking2 UUID; v_customer UUID;
  v_provider UUID := gen_random_uuid(); v_hold UUID; v_result JSONB;
BEGIN
  SELECT id INTO v_customer FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN
    RAISE NOTICE 'STEP 5 functional selftest skipped'; RETURN;
  END IF;

  INSERT INTO public.bookings (
    id,customer_user_id,provider_id,provider_name,service,hours,booking_date,slot,
    address,customer_pays,provider_gets,currency,status,payment_status,payout_status,
    payment_flow_version,funds_release_at,country_code,timezone
  ) VALUES (
    gen_random_uuid(),v_customer,v_provider::text,'Selftest A','step5-a',2,
    CURRENT_DATE-1,'10:00','x',10000,8000,'DKK',
    'completed','captured','pending','separate_charges_v1',
    now()-interval '1 hour','DK','Europe/Copenhagen'
  ) RETURNING id INTO v_booking;

  v_result := public.evaluate_booking_release_eligibility_v1(v_booking, NULL, 'selftest');
  IF v_result->>'decision' NOT IN ('not_eligible','blocked') THEN
    RAISE EXCEPTION 'SELFTEST FAIL missing profile decision=%', v_result->>'decision'; END IF;

  v_hold := public.create_booking_hold_v1(v_booking,'admin_block'::public.booking_hold_type,
    'selftest',v_customer,'admin',NULL,'{}'::jsonb);
  v_result := public.evaluate_booking_release_eligibility_v1(v_booking,NULL,'selftest');
  IF v_result->>'decision'<>'blocked' THEN
    RAISE EXCEPTION 'SELFTEST FAIL admin_block decision=%', v_result->>'decision'; END IF;

  PERFORM public.release_booking_hold_v1(v_hold,v_customer,'admin','ok');
  v_result := public.evaluate_booking_release_eligibility_v1(v_booking,NULL,'selftest');
  IF v_result->>'decision'='eligible' THEN RAISE EXCEPTION 'SELFTEST FAIL post-release'; END IF;

  INSERT INTO public.bookings (
    id,customer_user_id,provider_id,provider_name,service,hours,booking_date,slot,
    address,customer_pays,provider_gets,currency,status,payment_status,payout_status,
    payment_flow_version,funds_release_at,country_code,timezone
  ) VALUES (
    gen_random_uuid(),v_customer,v_provider::text,'Selftest B','step5-b',2,
    CURRENT_DATE-1,'10:00','x',10000,8000,'DKK',
    'completed','captured','pending','destination_charge_v1',
    now()-interval '1 hour','DK','Europe/Copenhagen'
  ) RETURNING id INTO v_booking2;
  v_result := public.evaluate_booking_release_eligibility_v1(v_booking2,NULL,'selftest');
  IF v_result->>'decision'<>'blocked' THEN
    RAISE EXCEPTION 'SELFTEST FAIL incompat flow decision=%', v_result->>'decision'; END IF;

  UPDATE public.bookings SET status='pending', funds_release_at=now()+interval '1 day' WHERE id=v_booking;
  v_result := public.evaluate_booking_release_eligibility_v1(v_booking,NULL,'selftest');
  IF v_result->>'decision'='eligible' THEN RAISE EXCEPTION 'SELFTEST FAIL pending eligible'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'reasons') r
                 WHERE r->>'code' IN ('BOOKING_NOT_COMPLETED','HOLD_NOT_ELAPSED')) THEN
    RAISE EXCEPTION 'SELFTEST FAIL expected NOT_COMPLETED/HOLD_NOT_ELAPSED'; END IF;

  DELETE FROM public.bookings WHERE id IN (v_booking,v_booking2);
  RAISE NOTICE 'STEP 5 functional selftest: 5 cases passed (audit rows retained)';
END $$;
