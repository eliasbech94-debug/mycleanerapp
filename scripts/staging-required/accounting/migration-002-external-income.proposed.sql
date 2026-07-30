-- External income from other platforms and own customers — schema proposal (NOT applied)
-- Additive only. No drops, no destructive changes. Review before staging.

CREATE TABLE IF NOT EXISTS public.provider_external_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  income_source_type text NOT NULL,        -- other_platform | own_customer | invoice | bank_transfer | cash | other
  source_name text,
  platform_name text,
  customer_reference text,
  invoice_number text,

  income_date date NOT NULL,
  service_date_from date,
  service_date_to date,

  description text NOT NULL,

  original_amount_minor bigint NOT NULL,
  original_currency text NOT NULL,
  accounting_amount_minor bigint,
  accounting_currency text,
  exchange_rate numeric(20,10),
  exchange_rate_date date,
  exchange_rate_source text,

  indirect_tax_included boolean,
  tax_rate numeric(9,6),
  tax_amount_minor bigint,
  tax_code text,
  tax_jurisdiction text,
  tax_treatment text,

  payment_method text NOT NULL,            -- bank_transfer | cash | card | platform_payout | invoice | other
  payment_status text NOT NULL,            -- expected | invoiced | partially_paid | paid | cancelled | refunded
  documentation_status text NOT NULL DEFAULT 'missing',

  -- Platform payout breakdown (minor units, validated: gross - fee - tax = net)
  payout_period_from date,
  payout_period_to date,
  payout_date date,
  payout_reference text,
  gross_income_minor bigint,
  platform_fee_minor bigint,
  tax_withheld_minor bigint,
  net_payout_minor bigint,

  notes text,
  cash_reviewed_by_provider boolean NOT NULL DEFAULT false,
  imported_from text,
  duplicate_override_reason text,
  document_hashes text[] NOT NULL DEFAULT '{}',

  -- Frozen context so history never silently recomputes
  jurisdiction_code text,
  rule_pack_id uuid,
  rule_pack_version text,

  -- Backend-authoritative: providers may not set included/excluded
  record_status text NOT NULL DEFAULT 'draft',
  review_required boolean NOT NULL DEFAULT true,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_external_income_user_period_idx
  ON public.provider_external_income (user_id, income_date)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.provider_external_income TO authenticated;
GRANT ALL ON public.provider_external_income TO service_role;
ALTER TABLE public.provider_external_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers read their own external income"
  ON public.provider_external_income FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Providers create their own external income"
  ON public.provider_external_income FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Providers update their own non-deleted external income"
  ON public.provider_external_income FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- Providers may never mark a row as included/excluded — only the engine may.
CREATE OR REPLACE FUNCTION public.provider_external_income_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NEW.record_status IN ('included', 'excluded') THEN
    RAISE EXCEPTION 'record_status % is set by the accounting engine only', NEW.record_status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_external_income_status_guard
  ON public.provider_external_income;
CREATE TRIGGER provider_external_income_status_guard
  BEFORE INSERT OR UPDATE ON public.provider_external_income
  FOR EACH ROW EXECUTE FUNCTION public.provider_external_income_status_guard();

-- Documentation lives in a private bucket; only path references are stored.
CREATE TABLE IF NOT EXISTS public.provider_external_income_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL REFERENCES public.provider_external_income(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  byte_size bigint,
  checksum_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.provider_external_income_documents TO authenticated;
GRANT ALL ON public.provider_external_income_documents TO service_role;
ALTER TABLE public.provider_external_income_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers read their own income documents"
  ON public.provider_external_income_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Providers attach their own income documents"
  ON public.provider_external_income_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
