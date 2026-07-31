-- =====================================================================
-- Provider approval engine: Sumsub identity + photo moderation + gates
-- =====================================================================

-- ---------- 0. platform runtime config (sandbox vs production) --------
CREATE TABLE IF NOT EXISTS public.platform_runtime_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.platform_runtime_config TO authenticated;
GRANT ALL ON public.platform_runtime_config TO service_role;
ALTER TABLE public.platform_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prc_admin_read ON public.platform_runtime_config;
CREATE POLICY prc_admin_read ON public.platform_runtime_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS prc_superadmin_write ON public.platform_runtime_config;
CREATE POLICY prc_superadmin_write ON public.platform_runtime_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.platform_runtime_config(key, value)
VALUES ('environment','production')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_is_production()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Fail closed: unknown / missing config == production.
  SELECT COALESCE(
    (SELECT lower(btrim(value)) NOT IN ('development','dev','staging','preview','test','local')
       FROM public.platform_runtime_config WHERE key='environment'),
    true);
$$;

-- ---------- 1. provider_profiles: new authoritative columns -----------
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS is_bookable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS approval_gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_blocked_reason text,
  ADD COLUMN IF NOT EXISTS photo_moderation_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS quiz_passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quiz_score smallint,
  ADD COLUMN IF NOT EXISTS identity_sandbox boolean,
  ADD COLUMN IF NOT EXISTS identity_applicant_id text,
  ADD COLUMN IF NOT EXISTS identity_reviewed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.provider_profiles
    ADD CONSTRAINT provider_profiles_approval_state_chk CHECK (approval_state IN (
      'incomplete','awaiting_identity','identity_in_review','awaiting_profile_photo',
      'photo_in_review','awaiting_profile_completion','awaiting_documents',
      'awaiting_stripe','manual_review','approved','rejected','suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.provider_profiles
    ADD CONSTRAINT provider_profiles_photo_mod_chk CHECK (photo_moderation_status IN (
      'not_started','pending','approved','rejected','manual_review'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pp_approval_state ON public.provider_profiles(approval_state);
CREATE INDEX IF NOT EXISTS idx_pp_bookable ON public.provider_profiles(is_bookable) WHERE is_bookable;

-- protected columns: providers may never write these directly
CREATE OR REPLACE FUNCTION public.provider_profile_protected_columns()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT ARRAY[
    'user_id','status','visibility','is_public','is_bookable','provider_slug',
    'approved_at','approved_by','activated_at','suspended_at','suspended_by',
    'rejected_at','rejected_reason','archived_at','archived_by',
    'identity_status','identity_sandbox','identity_applicant_id','identity_reviewed_at',
    'completion_pct','approval_state','approval_gates','approval_evaluated_at',
    'approval_blocked_reason','photo_moderation_status','quiz_passed_at','quiz_score',
    'stripe_charges_enabled','stripe_payouts_enabled','stripe_details_submitted',
    'stripe_requirements_due','stripe_disabled_reason',
    'payout_frozen','payout_frozen_reason',
    'provider_score','provider_tier','tier_is_manual','tier_calculated_at',
    'scoring_config_version','performance_snapshot'
  ]
$$;

CREATE OR REPLACE FUNCTION public.provider_profile_scope_allowlist(_scope text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT CASE _scope
    WHEN 'stripe_sync' THEN ARRAY[
      'stripe_charges_enabled','stripe_payouts_enabled','stripe_details_submitted',
      'stripe_requirements_due','stripe_disabled_reason','updated_at']
    WHEN 'identity_sync' THEN ARRAY[
      'identity_status','identity_sandbox','identity_applicant_id','identity_reviewed_at','updated_at']
    WHEN 'photo_moderation' THEN ARRAY['photo_moderation_status','updated_at']
    WHEN 'quiz_result' THEN ARRAY['quiz_passed_at','quiz_score','updated_at']
    WHEN 'approval_engine' THEN ARRAY[
      'status','visibility','is_public','is_bookable','approval_state','approval_gates',
      'approval_evaluated_at','approval_blocked_reason','approved_at','activated_at',
      'suspended_at','rejected_at','rejected_reason','completion_pct','updated_at']
    WHEN 'scoring_refresh' THEN ARRAY[
      'provider_score','provider_tier','tier_is_manual','tier_calculated_at',
      'scoring_config_version','performance_snapshot','avg_response_minutes','updated_at']
    WHEN 'finance_update' THEN ARRAY[
      'payout_frozen','payout_frozen_reason','updated_at']
    WHEN 'admin_review' THEN ARRAY[
      'status','visibility','is_public','is_bookable','approval_state','approval_blocked_reason',
      'approved_at','approved_by','activated_at',
      'suspended_at','suspended_by','rejected_at','rejected_reason',
      'archived_at','archived_by','payout_frozen','payout_frozen_reason',
      'provider_tier','tier_is_manual','tier_calculated_at','updated_at']
    WHEN 'status_reconcile' THEN ARRAY['status','updated_at']
    WHEN 'application_lifecycle' THEN ARRAY[
      'status','visibility','submitted_at','completion_pct','updated_at']
    ELSE NULL::text[]
  END
$$;
REVOKE ALL ON FUNCTION public.provider_profile_scope_allowlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_scope_allowlist(text) TO authenticated, service_role;

-- ---------- 2. photo moderation ---------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_photo_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL,
  photo_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','manual_review')),
  reason_codes text[] NOT NULL DEFAULT '{}',
  confidence numeric(4,3),
  model text,
  model_version text,
  provider_message text,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_photo_moderation TO authenticated;
GRANT ALL ON public.provider_photo_moderation TO service_role;
ALTER TABLE public.provider_photo_moderation ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ppm_provider ON public.provider_photo_moderation(provider_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppm_provider_path ON public.provider_photo_moderation(provider_user_id, photo_path);

DROP POLICY IF EXISTS ppm_owner_read ON public.provider_photo_moderation;
CREATE POLICY ppm_owner_read ON public.provider_photo_moderation
  FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid() OR public.is_admin_only(auth.uid()));

-- No INSERT/UPDATE/DELETE policy: only service role / SECURITY DEFINER may write.

-- ---------- 3. quiz ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL,
  quiz_key text NOT NULL DEFAULT 'provider_basics_v1',
  score smallint NOT NULL,
  max_score smallint NOT NULL,
  passed boolean NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_quiz_attempts TO authenticated;
GRANT ALL ON public.provider_quiz_attempts TO service_role;
ALTER TABLE public.provider_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pqa_provider ON public.provider_quiz_attempts(provider_user_id, created_at DESC);

DROP POLICY IF EXISTS pqa_owner_read ON public.provider_quiz_attempts;
CREATE POLICY pqa_owner_read ON public.provider_quiz_attempts
  FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid() OR public.is_admin_only(auth.uid()));

-- ---------- 4. audit ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_approval_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL,
  from_state text,
  to_state text NOT NULL,
  gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  source text NOT NULL DEFAULT 'engine',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_approval_audit TO authenticated;
GRANT ALL ON public.provider_approval_audit TO service_role;
ALTER TABLE public.provider_approval_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_paa_provider ON public.provider_approval_audit(provider_user_id, created_at DESC);

DROP POLICY IF EXISTS paa_read ON public.provider_approval_audit;
CREATE POLICY paa_read ON public.provider_approval_audit
  FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid() OR public.is_admin_only(auth.uid()));

-- ---------- 5. gate evaluation (pure, read-only) -----------------------
CREATE OR REPLACE FUNCTION public.provider_approval_gates(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pp public.provider_profiles;
  pr public.profiles;
  au_confirmed timestamptz;
  ident public.person_identities;
  photo public.provider_photo_moderation;
  g_identity boolean := false;
  g_identity_review boolean := false;
  g_photo boolean := false;
  g_photo_review boolean := false;
  g_profile boolean := false;
  g_services boolean := false;
  g_quiz boolean := false;
  g_docs boolean := false;
  g_stripe boolean := false;
  v_min_minor int;
  v_country text;
  missing text[] := '{}';
BEGIN
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','provider_profile_missing');
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE id = _uid;
  SELECT email_confirmed_at INTO au_confirmed FROM auth.users WHERE id = _uid;

  SELECT pi.* INTO ident
    FROM public.person_identities pi
    JOIN public.identity_account_links l ON l.identity_id = pi.id
   WHERE l.user_id = _uid
   ORDER BY pi.updated_at DESC NULLS LAST
   LIMIT 1;

  -- GATE 1: identity (Sumsub). NULL/unknown == FALSE. Sandbox never approves in production.
  g_identity :=
    COALESCE(pp.identity_status = 'approved', false)
    AND COALESCE(ident.status::text = 'approved', false)
    AND COALESCE((ident.metadata->>'reviewStatus') = 'completed', false)
    AND COALESCE(upper(ident.metadata->>'reviewAnswer') = 'GREEN', false)
    AND (NOT public.platform_is_production() OR COALESCE(pp.identity_sandbox = false, false));
  g_identity_review := (NOT g_identity)
    AND COALESCE(pp.identity_status IN ('pending','on_hold'), false);

  -- GATE 2: profile photo moderation
  SELECT * INTO photo FROM public.provider_photo_moderation
   WHERE provider_user_id = _uid AND photo_path = COALESCE(pp.photo_path,'')
   ORDER BY created_at DESC LIMIT 1;
  g_photo := pp.photo_path IS NOT NULL AND COALESCE(photo.status = 'approved', false);
  g_photo_review := pp.photo_path IS NOT NULL AND COALESCE(photo.status IN ('pending','manual_review'), false);

  -- GATE 3: profile completeness
  g_profile :=
    COALESCE(length(btrim(pp.display_name)) > 0, false)
    AND COALESCE(length(btrim(pp.headline)) > 0, false)
    AND COALESCE(length(btrim(pp.bio)) >= 40, false)
    AND pp.date_of_birth IS NOT NULL
    AND COALESCE(pp.date_of_birth <= (current_date - interval '18 years')::date, false)
    AND COALESCE(array_length(pp.languages,1) > 0, false)
    AND pp.base_address_place_id IS NOT NULL
    AND pp.base_country_code IS NOT NULL
    AND pr.sms_verified_at IS NOT NULL
    AND au_confirmed IS NOT NULL
    AND pp.terms_accepted_at IS NOT NULL;

  -- GATE 4: at least one active service priced at or above the country floor
  v_country := upper(COALESCE(pp.base_country_code, pr.country_code, ''));
  SELECT min_hourly_minor INTO v_min_minor
    FROM public.market_pricing_rules
   WHERE upper(country_code) = v_country AND active AND scope = 'country'
   ORDER BY updated_at DESC LIMIT 1;
  IF v_min_minor IS NULL THEN
    SELECT (min_hourly_rate * 100)::int INTO v_min_minor
      FROM public.market_rate_thresholds WHERE upper(country_code) = v_country LIMIT 1;
  END IF;
  g_services := v_country <> '' AND v_min_minor IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.provider_pricing_settings s
     WHERE s.provider_user_id = _uid AND s.enabled
       AND s.base_rate_minor IS NOT NULL
       AND s.base_rate_minor >= v_min_minor
  );

  -- GATE 5: mandatory quiz
  g_quiz := pp.quiz_passed_at IS NOT NULL;

  -- GATE 6: insurance / documents
  g_docs :=
    pp.insurance_doc_path IS NOT NULL
    AND COALESCE(length(btrim(pp.insurance_policy_number)) > 0, false)
    AND pp.insurance_expires_on IS NOT NULL
    AND COALESCE(pp.insurance_expires_on > current_date, false);

  -- GATE 7: Stripe Connect payout readiness
  g_stripe :=
    COALESCE(pp.stripe_details_submitted, false)
    AND COALESCE(pp.stripe_payouts_enabled, false)
    AND COALESCE(pp.stripe_charges_enabled, false)
    AND COALESCE(array_length(pp.stripe_requirements_due,1), 0) = 0
    AND COALESCE(pp.payout_frozen, false) = false;

  IF NOT g_identity THEN missing := missing || 'identity'; END IF;
  IF NOT g_photo THEN missing := missing || 'photo'; END IF;
  IF NOT g_profile THEN missing := missing || 'profile'; END IF;
  IF NOT g_services THEN missing := missing || 'services'; END IF;
  IF NOT g_quiz THEN missing := missing || 'quiz'; END IF;
  IF NOT g_docs THEN missing := missing || 'documents'; END IF;
  IF NOT g_stripe THEN missing := missing || 'stripe'; END IF;

  RETURN jsonb_build_object(
    'identity', g_identity,
    'identity_in_review', g_identity_review,
    'photo', g_photo,
    'photo_in_review', g_photo_review,
    'photo_status', COALESCE(photo.status,'not_started'),
    'photo_reason_codes', COALESCE(to_jsonb(photo.reason_codes), '[]'::jsonb),
    'profile', g_profile,
    'services', g_services,
    'quiz', g_quiz,
    'documents', g_docs,
    'stripe', g_stripe,
    'all_green', (g_identity AND g_photo AND g_profile AND g_services AND g_quiz AND g_docs AND g_stripe),
    'missing', to_jsonb(missing),
    'sandbox_identity', COALESCE(pp.identity_sandbox, null),
    'production', public.platform_is_production(),
    'evaluated_at', now()
  );
END $$;
REVOKE ALL ON FUNCTION public.provider_approval_gates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_approval_gates(uuid) TO authenticated, service_role;

-- ---------- 6. THE central status engine -------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_provider_approval(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pp public.provider_profiles;
  gates jsonb;
  prev_state text;
  new_state text;
  v_public boolean := false;
  v_bookable boolean := false;
  v_status public.provider_status;
  v_blocked text := null;
  is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role'
                        OR current_setting('role', true) = 'service_role';
BEGIN
  IF NOT (is_service OR public.is_admin_only(auth.uid())) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;

  prev_state := pp.approval_state;
  gates := public.provider_approval_gates(_uid);

  -- Terminal admin states are never overridden by the engine.
  IF pp.approval_state IN ('rejected','suspended') THEN
    UPDATE public.provider_profiles SET approval_gates = gates, approval_evaluated_at = now()
     WHERE user_id = _uid;
    RETURN jsonb_build_object('state', pp.approval_state, 'gates', gates, 'changed', false);
  END IF;

  IF (gates->>'all_green')::boolean THEN
    new_state := 'approved'; v_public := true; v_bookable := true; v_status := 'active';
  ELSE
    v_public := false; v_bookable := false;
    IF NOT (gates->>'identity')::boolean THEN
      new_state := CASE WHEN (gates->>'identity_in_review')::boolean
                        THEN 'identity_in_review' ELSE 'awaiting_identity' END;
      v_status := 'pending_identity';
    ELSIF NOT (gates->>'photo')::boolean THEN
      new_state := CASE WHEN (gates->>'photo_in_review')::boolean
                        THEN 'photo_in_review' ELSE 'awaiting_profile_photo' END;
      v_status := 'draft';
    ELSIF NOT (gates->>'profile')::boolean OR NOT (gates->>'services')::boolean
          OR NOT (gates->>'quiz')::boolean THEN
      new_state := 'awaiting_profile_completion'; v_status := 'draft';
    ELSIF NOT (gates->>'documents')::boolean THEN
      new_state := 'awaiting_documents'; v_status := 'draft';
    ELSIF NOT (gates->>'stripe')::boolean THEN
      new_state := 'awaiting_stripe'; v_status := 'pending_stripe';
    ELSE
      new_state := 'manual_review'; v_status := 'pending_review';
    END IF;
    v_blocked := gates->>'missing';
  END IF;

  -- Previously approved provider that lost a critical gate:
  -- keep history, stop bookability, route to manual review (never auto-reject).
  IF prev_state = 'approved' AND new_state <> 'approved' THEN
    new_state := 'manual_review';
    v_status := 'pending_review';
    v_public := false;
    v_bookable := false;
  END IF;

  PERFORM public._pp_scope_set('approval_engine');
  UPDATE public.provider_profiles SET
    approval_state = new_state,
    approval_gates = gates,
    approval_evaluated_at = now(),
    approval_blocked_reason = v_blocked,
    is_public = v_public,
    is_bookable = v_bookable,
    visibility = CASE WHEN v_public THEN 'public'::provider_visibility ELSE 'hidden'::provider_visibility END,
    status = CASE WHEN pp.status IN ('paused','archived') THEN pp.status ELSE v_status END,
    approved_at = CASE WHEN new_state='approved' THEN COALESCE(pp.approved_at, now()) ELSE pp.approved_at END,
    activated_at = CASE WHEN new_state='approved' THEN COALESCE(pp.activated_at, now()) ELSE pp.activated_at END,
    updated_at = now()
  WHERE user_id = _uid;
  PERFORM public._pp_scope_clear();

  IF new_state IS DISTINCT FROM prev_state THEN
    INSERT INTO public.provider_approval_audit(provider_user_id, from_state, to_state, gates, actor_id, source)
    VALUES (_uid, prev_state, new_state, gates, auth.uid(), 'engine');
  END IF;

  RETURN jsonb_build_object(
    'state', new_state, 'previous_state', prev_state, 'gates', gates,
    'is_public', v_public, 'is_bookable', v_bookable,
    'changed', new_state IS DISTINCT FROM prev_state);
END $$;
REVOKE ALL ON FUNCTION public.evaluate_provider_approval(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_provider_approval(uuid) TO service_role;

-- ---------- 7. admin manual decision ----------------------------------
CREATE OR REPLACE FUNCTION public.admin_provider_approval_decision(
  _uid uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pp public.provider_profiles;
  gates jsonb;
  prev text;
BEGIN
  IF NOT public.is_admin_only(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF _decision NOT IN ('approve','reject','suspend','reopen') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  prev := pp.approval_state;
  gates := public.provider_approval_gates(_uid);

  -- Manual approval still requires every hard gate to be green.
  IF _decision = 'approve' AND NOT (gates->>'all_green')::boolean THEN
    RAISE EXCEPTION 'gates_not_satisfied';
  END IF;

  PERFORM public._pp_scope_set('admin_review');
  UPDATE public.provider_profiles SET
    approval_state = CASE _decision
      WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
      WHEN 'suspend' THEN 'suspended' ELSE 'manual_review' END,
    status = CASE _decision
      WHEN 'approve' THEN 'active'::provider_status
      WHEN 'reject' THEN 'rejected'::provider_status
      WHEN 'suspend' THEN 'suspended'::provider_status
      ELSE 'pending_review'::provider_status END,
    is_public = (_decision = 'approve'),
    is_bookable = (_decision = 'approve'),
    visibility = CASE WHEN _decision='approve' THEN 'public'::provider_visibility ELSE 'hidden'::provider_visibility END,
    approved_at = CASE WHEN _decision='approve' THEN COALESCE(pp.approved_at, now()) ELSE pp.approved_at END,
    approved_by = CASE WHEN _decision='approve' THEN auth.uid() ELSE pp.approved_by END,
    activated_at = CASE WHEN _decision='approve' THEN COALESCE(pp.activated_at, now()) ELSE pp.activated_at END,
    rejected_at = CASE WHEN _decision='reject' THEN now() ELSE pp.rejected_at END,
    rejected_reason = CASE WHEN _decision='reject' THEN _reason ELSE pp.rejected_reason END,
    suspended_at = CASE WHEN _decision='suspend' THEN now() ELSE pp.suspended_at END,
    suspended_by = CASE WHEN _decision='suspend' THEN auth.uid() ELSE pp.suspended_by END,
    approval_blocked_reason = CASE WHEN _decision IN ('reject','suspend') THEN _reason ELSE pp.approval_blocked_reason END,
    updated_at = now()
  WHERE user_id = _uid;
  PERFORM public._pp_scope_clear();

  INSERT INTO public.provider_approval_audit(provider_user_id, from_state, to_state, gates, actor_id, source, reason)
  VALUES (_uid, prev,
    CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
                   WHEN 'suspend' THEN 'suspended' ELSE 'manual_review' END,
    gates, auth.uid(), 'admin', _reason);

  RETURN jsonb_build_object('ok', true, 'decision', _decision, 'gates', gates);
END $$;
REVOKE ALL ON FUNCTION public.admin_provider_approval_decision(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provider_approval_decision(uuid,text,text) TO authenticated, service_role;

-- ---------- 8. self-serve read of own gates ---------------------------
CREATE OR REPLACE FUNCTION public.my_provider_approval_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); pp public.provider_profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO pp FROM public.provider_profiles WHERE user_id = v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', null); END IF;
  RETURN jsonb_build_object(
    'state', pp.approval_state,
    'is_public', pp.is_public,
    'is_bookable', pp.is_bookable,
    'evaluated_at', pp.approval_evaluated_at,
    'photo_moderation_status', pp.photo_moderation_status,
    'gates', public.provider_approval_gates(v_uid));
END $$;
REVOKE ALL ON FUNCTION public.my_provider_approval_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_provider_approval_status() TO authenticated;