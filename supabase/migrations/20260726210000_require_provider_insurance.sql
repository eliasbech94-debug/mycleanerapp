-- Require valid provider liability insurance for new applications and any
-- future transition into active status. Existing active providers are not
-- automatically suspended by this compatibility-safe guard.

CREATE OR REPLACE FUNCTION public.provider_insurance_ready(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_profiles pp
    WHERE pp.user_id = _uid
      AND NULLIF(btrim(pp.insurance_policy_number), '') IS NOT NULL
      AND NULLIF(btrim(pp.insurance_doc_path), '') IS NOT NULL
      AND pp.insurance_expires_on IS NOT NULL
      AND pp.insurance_expires_on >= current_date
  );
$$;

REVOKE ALL ON FUNCTION public.provider_insurance_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_insurance_ready(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_require_insurance_for_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
     AND OLD.status IS DISTINCT FROM 'active'
     AND NOT public.provider_insurance_ready(NEW.user_id) THEN
    RAISE EXCEPTION 'provider_insurance_required'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_require_insurance_for_activation ON public.provider_profiles;
CREATE TRIGGER trg_provider_require_insurance_for_activation
BEFORE UPDATE OF status ON public.provider_profiles
FOR EACH ROW
EXECUTE FUNCTION public.provider_require_insurance_for_activation();

CREATE OR REPLACE FUNCTION public.submit_provider_application()
RETURNS public.provider_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  pp public.provider_profiles;
  pr public.profiles;
  comp jsonb;
  v_pct int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pp
  FROM public.provider_profiles
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'provider_profile_missing'; END IF;
  IF pp.status NOT IN ('draft', 'pending_identity', 'pending_stripe', 'rejected') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  SELECT * INTO pr FROM public.profiles WHERE id = v_uid;

  IF pp.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'provider_dob_missing' USING ERRCODE = 'check_violation';
  END IF;
  IF pp.date_of_birth > (current_date - interval '18 years')::date THEN
    RAISE EXCEPTION 'provider_underage' USING ERRCODE = 'check_violation';
  END IF;

  comp := public.calc_provider_completion(v_uid);
  v_pct := (comp->>'pct')::int;
  IF v_pct < 100 THEN RAISE EXCEPTION 'requirements_incomplete'; END IF;
  IF pr.sms_verified_at IS NULL THEN RAISE EXCEPTION 'phone_not_verified'; END IF;
  IF pp.identity_status <> 'approved' THEN RAISE EXCEPTION 'identity_not_approved'; END IF;
  IF NOT (pp.stripe_charges_enabled AND pp.stripe_payouts_enabled) THEN
    RAISE EXCEPTION 'stripe_not_ready';
  END IF;
  IF pp.terms_accepted_at IS NULL THEN RAISE EXCEPTION 'requirements_incomplete'; END IF;
  IF NOT public.provider_insurance_ready(v_uid) THEN
    RAISE EXCEPTION 'provider_insurance_required' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._pp_as_service();
  UPDATE public.provider_profiles
  SET status = 'pending_review',
      submitted_at = COALESCE(submitted_at, now()),
      completion_pct = 100,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING * INTO pp;

  INSERT INTO public.provider_admin_actions(user_id, actor_id, action, from_status, to_status)
  VALUES (v_uid, v_uid, 'submitted', pp.status, 'pending_review');

  RETURN pp;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_provider_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_application() TO authenticated, service_role;
