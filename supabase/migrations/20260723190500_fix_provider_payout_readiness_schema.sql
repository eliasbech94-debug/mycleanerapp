-- Funds Release v7 — Step 6 compatibility repair
--
-- The Step 5 readiness function was authored against an obsolete
-- provider_trust shape (provider_user_id + stripe_account_id). The canonical
-- schema stores the provider key as provider_profiles.user_id and the Stripe
-- account id as profiles.stripe_account_id. Replace only that lookup before
-- Step 6 invokes the function. Funds Release remains disabled.

DO $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT enabled INTO v_enabled
  FROM public.feature_flags
  WHERE flag_key = 'funds_release.enabled' AND scope = 'global';

  IF v_enabled IS TRUE THEN
    RAISE EXCEPTION 'Refusing readiness repair: funds_release.enabled must be false';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_provider_payout_readiness_v1(p_provider_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_reasons jsonb := '[]'::jsonb;
  v_ready boolean := true;
BEGIN
  SELECT
    pp.*,
    p.stripe_account_id AS effective_stripe_account_id
  INTO v_profile
  FROM public.provider_profiles pp
  LEFT JOIN public.profiles p ON p.id = pp.user_id
  WHERE pp.user_id = p_provider_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ready', false,
      'provider_user_id', p_provider_user_id,
      'reasons', jsonb_build_array(
        jsonb_build_object('code', 'PROVIDER_PROFILE_MISSING', 'severity', 'fatal')
      )
    );
  END IF;

  IF v_profile.status = 'suspended' THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_SUSPENDED', 'severity', 'blocking'
    );
  END IF;

  IF v_profile.status IN ('rejected', 'archived') THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_INACTIVE', 'severity', 'blocking',
      'meta', jsonb_build_object('status', v_profile.status)
    );
  END IF;

  IF v_profile.payout_frozen IS TRUE THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_PAYOUT_FROZEN', 'severity', 'blocking',
      'meta', jsonb_build_object('reason', v_profile.payout_frozen_reason)
    );
  END IF;

  IF v_profile.effective_stripe_account_id IS NULL THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_NOT_STRIPE_CONNECTED', 'severity', 'blocking'
    );
  END IF;

  IF COALESCE(v_profile.stripe_charges_enabled, false) = false THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_CHARGES_DISABLED', 'severity', 'blocking'
    );
  END IF;

  IF COALESCE(v_profile.stripe_payouts_enabled, false) = false THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_PAYOUTS_DISABLED', 'severity', 'blocking'
    );
  END IF;

  IF COALESCE(v_profile.stripe_details_submitted, false) = false THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_KYC_INCOMPLETE', 'severity', 'blocking'
    );
  END IF;

  IF v_profile.stripe_disabled_reason IS NOT NULL THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_STRIPE_DISABLED', 'severity', 'blocking',
      'meta', jsonb_build_object('reason', v_profile.stripe_disabled_reason)
    );
  END IF;

  IF v_profile.stripe_requirements_due IS NOT NULL
     AND array_length(v_profile.stripe_requirements_due, 1) > 0 THEN
    v_ready := false;
    v_reasons := v_reasons || jsonb_build_object(
      'code', 'PROVIDER_REQUIREMENTS_DUE', 'severity', 'blocking',
      'meta', jsonb_build_object('due', to_jsonb(v_profile.stripe_requirements_due))
    );
  END IF;

  RETURN jsonb_build_object(
    'ready', v_ready,
    'provider_user_id', p_provider_user_id,
    'stripe_account_id', v_profile.effective_stripe_account_id,
    'status', v_profile.status,
    'charges_enabled', COALESCE(v_profile.stripe_charges_enabled, false),
    'payouts_enabled', COALESCE(v_profile.stripe_payouts_enabled, false),
    'details_submitted', COALESCE(v_profile.stripe_details_submitted, false),
    'payout_frozen', COALESCE(v_profile.payout_frozen, false),
    'reasons', v_reasons
  );
END $$;

REVOKE ALL ON FUNCTION public.check_provider_payout_readiness_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_provider_payout_readiness_v1(uuid)
  TO service_role;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.check_provider_payout_readiness_v1(
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  IF v_result->>'ready' IS DISTINCT FROM 'false'
     OR v_result->'reasons'->0->>'code' IS DISTINCT FROM 'PROVIDER_PROFILE_MISSING' THEN
    RAISE EXCEPTION 'Readiness repair self-test failed: %', v_result;
  END IF;
END $$;
