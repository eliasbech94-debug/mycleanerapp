-- International Accounting Engine — additive schema proposal (NOT applied)
-- Run only against staging after review. No destructive changes, no drops.

-- 1. Country rule packs -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_rule_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  rule_pack_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',            -- draft | published | archived
  effective_from date NOT NULL,
  effective_to date,
  default_currency text NOT NULL,
  default_locale text,
  indirect_tax_system text NOT NULL,               -- vat_like | sales_tax_like | none | unknown
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  expense_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  mileage_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  indirect_tax_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  reverse_charge_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  disclaimers jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_only boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, rule_pack_version)
);

GRANT SELECT ON public.accounting_rule_packs TO authenticated;
GRANT ALL ON public.accounting_rule_packs TO service_role;
ALTER TABLE public.accounting_rule_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published rule packs are readable by signed-in users"
  ON public.accounting_rule_packs FOR SELECT TO authenticated
  USING (status = 'published');

CREATE POLICY "Admins manage rule packs"
  ON public.accounting_rule_packs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Additive columns on provider_tax_profiles --------------------------
-- Legacy Danish-specific columns are kept and marked deprecated in code.
ALTER TABLE public.provider_tax_profiles
  ADD COLUMN IF NOT EXISTS tax_residence_country text,
  ADD COLUMN IF NOT EXISTS registration_country text,
  ADD COLUMN IF NOT EXISTS primary_work_country text,
  ADD COLUMN IF NOT EXISTS registration_type text,          -- unregistered | sole_trader | company | unknown
  ADD COLUMN IF NOT EXISTS business_registration_number text,
  ADD COLUMN IF NOT EXISTS indirect_tax_status text,        -- not_registered | registered | exempt | unknown
  ADD COLUMN IF NOT EXISTS indirect_tax_number text,
  ADD COLUMN IF NOT EXISTS accounting_currency text,
  ADD COLUMN IF NOT EXISTS preferred_locale text,
  ADD COLUMN IF NOT EXISTS profile_requires_review boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.provider_tax_profiles.profile_requires_review IS
  'Rows migrated from the Danish-only model must be re-confirmed by the provider before any amount is calculated.';

-- 3. Additive columns on provider_receipts ------------------------------
ALTER TABLE public.provider_receipts
  ADD COLUMN IF NOT EXISTS amount_minor bigint,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS accounting_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20,10),
  ADD COLUMN IF NOT EXISTS exchange_rate_date date,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS category_code text,
  ADD COLUMN IF NOT EXISTS business_use_percentage integer,
  ADD COLUMN IF NOT EXISTS merchant_country text,
  ADD COLUMN IF NOT EXISTS service_country text,
  ADD COLUMN IF NOT EXISTS indirect_tax_minor bigint,
  ADD COLUMN IF NOT EXISTS has_documentation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_suggested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transaction_date date;

-- 4. Accounting periods with frozen rule versions -----------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  kind text NOT NULL,                               -- monthly | quarterly | half_yearly | yearly | custom
  status text NOT NULL DEFAULT 'open',              -- open | closed
  frozen_rule_pack_id uuid REFERENCES public.accounting_rule_packs(id),
  frozen_rule_pack_version text,
  frozen_jurisdiction_code text,
  frozen_accounting_currency text,
  frozen_calculation_version text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers read their own periods"
  ON public.accounting_periods FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Providers create their own periods"
  ON public.accounting_periods FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Providers update their own open periods"
  ON public.accounting_periods FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'open')
  WITH CHECK (user_id = auth.uid());
