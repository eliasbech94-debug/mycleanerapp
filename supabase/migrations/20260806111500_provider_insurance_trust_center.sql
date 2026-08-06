-- Provider insurance + Trust Center foundation
--
-- Goals:
--   * Model provider-held liability insurance without claiming MyCleaner is the insurer.
--   * Keep verification auditable and country/service scoped.
--   * Prevent expired/rejected policies from being treated as verified.
--   * Expose a privacy-safe status surface for provider/admin dashboards.

CREATE TABLE IF NOT EXISTS public.provider_insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL REFERENCES public.provider_profiles(user_id) ON DELETE CASCADE,
  insurer_name text NOT NULL,
  policy_number_encrypted text NOT NULL,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  coverage_amount_minor bigint CHECK (coverage_amount_minor IS NULL OR coverage_amount_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  deductible_minor bigint CHECK (deductible_minor IS NULL OR deductible_minor >= 0),
  covered_service_categories text[] NOT NULL DEFAULT '{}',
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  document_storage_path text NOT NULL,
  document_sha256 text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired', 'revoked')),
  verification_notes text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_insurance_policy_dates_check CHECK (valid_until >= valid_from),
  CONSTRAINT provider_insurance_policy_currency_check CHECK (
    coverage_amount_minor IS NULL OR currency IS NOT NULL
  ),
  CONSTRAINT provider_insurance_policy_verified_check CHECK (
    verification_status <> 'verified' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_insurance_policies_provider_idx
  ON public.provider_insurance_policies(provider_user_id, verification_status, valid_until DESC);

CREATE UNIQUE INDEX IF NOT EXISTS provider_insurance_one_active_verified_per_country_uidx
  ON public.provider_insurance_policies(provider_user_id, country_code)
  WHERE verification_status = 'verified';

COMMENT ON TABLE public.provider_insurance_policies IS
  'Provider-held liability insurance. A verified row means MyCleaner verified evidence; it does not mean MyCleaner is the insurer.';
COMMENT ON COLUMN public.provider_insurance_policies.policy_number_encrypted IS
  'Encrypted policy identifier. Never expose through public provider profile APIs.';
COMMENT ON COLUMN public.provider_insurance_policies.document_storage_path IS
  'Private storage path. Access only through authenticated, authorised signed URLs.';

CREATE OR REPLACE FUNCTION public.refresh_provider_insurance_expiry(_provider_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.provider_insurance_policies
  SET verification_status = 'expired', updated_at = now()
  WHERE verification_status = 'verified'
    AND valid_until < current_date
    AND (_provider_user_id IS NULL OR provider_user_id = _provider_user_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_provider_insurance_expiry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_provider_insurance_expiry(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_provider_insurance_status(_provider_user_id uuid)
RETURNS TABLE (
  status text,
  country_code text,
  insurer_name text,
  valid_until date,
  coverage_amount_minor bigint,
  currency text,
  covered_service_categories text[],
  days_until_expiry integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('admin', 'employee')
  ) INTO v_is_admin;

  IF v_uid <> _provider_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN p.verification_status = 'verified' AND p.valid_until >= current_date THEN 'verified'
      WHEN p.verification_status = 'verified' AND p.valid_until < current_date THEN 'expired'
      ELSE p.verification_status
    END,
    p.country_code,
    p.insurer_name,
    p.valid_until,
    p.coverage_amount_minor,
    p.currency,
    p.covered_service_categories,
    (p.valid_until - current_date)::integer
  FROM public.provider_insurance_policies p
  WHERE p.provider_user_id = _provider_user_id
  ORDER BY
    (p.verification_status = 'verified' AND p.valid_until >= current_date) DESC,
    p.valid_until DESC,
    p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_provider_insurance_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_insurance_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_has_verified_insurance(
  _provider_user_id uuid,
  _country_code text,
  _service_category text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.provider_insurance_policies p
    WHERE p.provider_user_id = _provider_user_id
      AND p.country_code = upper(_country_code)
      AND p.verification_status = 'verified'
      AND p.valid_from <= current_date
      AND p.valid_until >= current_date
      AND (
        _service_category IS NULL
        OR cardinality(p.covered_service_categories) = 0
        OR _service_category = ANY(p.covered_service_categories)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.provider_has_verified_insurance(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_has_verified_insurance(uuid, text, text)
  TO anon, authenticated, service_role;

ALTER TABLE public.provider_insurance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers read own insurance" ON public.provider_insurance_policies;
CREATE POLICY "providers read own insurance"
  ON public.provider_insurance_policies
  FOR SELECT
  TO authenticated
  USING (provider_user_id = auth.uid());

DROP POLICY IF EXISTS "providers create own pending insurance" ON public.provider_insurance_policies;
CREATE POLICY "providers create own pending insurance"
  ON public.provider_insurance_policies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_user_id = auth.uid()
    AND verification_status = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

DROP POLICY IF EXISTS "providers update own pending insurance" ON public.provider_insurance_policies;
CREATE POLICY "providers update own pending insurance"
  ON public.provider_insurance_policies
  FOR UPDATE
  TO authenticated
  USING (provider_user_id = auth.uid() AND verification_status IN ('pending', 'rejected'))
  WITH CHECK (
    provider_user_id = auth.uid()
    AND verification_status = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

CREATE OR REPLACE VIEW public.provider_trust_center_summary
WITH (security_invoker = true)
AS
SELECT
  pp.user_id AS provider_user_id,
  pp.status AS provider_status,
  COALESCE(pr.stripe_charges_enabled, false) AS stripe_charges_enabled,
  COALESCE(pr.stripe_payouts_enabled, false) AS stripe_payouts_enabled,
  public.provider_has_verified_insurance(pp.user_id, COALESCE(pr.country_code, 'DK'), NULL)
    AS insurance_verified,
  (
    SELECT min(p.valid_until)
    FROM public.provider_insurance_policies p
    WHERE p.provider_user_id = pp.user_id
      AND p.verification_status = 'verified'
      AND p.valid_until >= current_date
  ) AS insurance_valid_until
FROM public.provider_profiles pp
LEFT JOIN public.profiles pr ON pr.id = pp.user_id;

GRANT SELECT ON public.provider_trust_center_summary TO authenticated, service_role;
