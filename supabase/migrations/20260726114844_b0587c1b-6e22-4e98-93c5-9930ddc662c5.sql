DROP TRIGGER IF EXISTS trg_provider_profiles_block_privileged ON public.provider_profiles;
DROP FUNCTION IF EXISTS public.provider_profiles_block_privileged_update();

-- completion_pct stays owner-protected (it is computed), keep it out of owner writes
CREATE OR REPLACE FUNCTION public.provider_profile_protected_columns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'user_id','status','visibility','is_public','provider_slug',
    'approved_at','approved_by','activated_at','suspended_at','suspended_by',
    'rejected_at','rejected_reason','archived_at','archived_by',
    'identity_status','completion_pct',
    'stripe_charges_enabled','stripe_payouts_enabled','stripe_details_submitted',
    'stripe_requirements_due','stripe_disabled_reason',
    'payout_frozen','payout_frozen_reason',
    'provider_score','provider_tier','tier_is_manual','tier_calculated_at',
    'scoring_config_version','performance_snapshot'
  ]
$$;

REVOKE ALL ON FUNCTION public.provider_profile_protected_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_profile_protected_columns() TO authenticated, service_role;