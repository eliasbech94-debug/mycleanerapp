
-- =========================================================================
-- Marketplace Invoicing & Tax Architecture
-- Additive only — does NOT alter bookings, payments, Stripe or finance_*.
-- =========================================================================

-- 1) provider_tax_profiles ------------------------------------------------
CREATE TABLE public.provider_tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  provider_type text NOT NULL DEFAULT 'private' CHECK (provider_type IN ('private','business')),
  vat_registered boolean NOT NULL DEFAULT false,
  vat_number text,
  business_name text,
  business_address text,
  tax_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_tax_profiles TO authenticated;
GRANT ALL ON public.provider_tax_profiles TO service_role;

ALTER TABLE public.provider_tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own tax profile"
  ON public.provider_tax_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = provider_user_id)
  WITH CHECK (auth.uid() = provider_user_id);

CREATE POLICY "Admins and employees view all tax profiles"
  ON public.provider_tax_profiles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_provider_tax_profiles_updated_at
  BEFORE UPDATE ON public.provider_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) platform_tax_settings ------------------------------------------------
CREATE TABLE public.platform_tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  legal_entity_name text NOT NULL DEFAULT 'MyCleaner ApS',
  legal_entity_address text,
  tax_id text,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  reverse_charge_eu boolean NOT NULL DEFAULT true,
  invoice_series_prefix text NOT NULL,
  next_invoice_number bigint NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_tax_settings TO authenticated;
GRANT ALL ON public.platform_tax_settings TO service_role;

ALTER TABLE public.platform_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage platform tax settings"
  ON public.platform_tax_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read platform tax settings"
  ON public.platform_tax_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_platform_tax_settings_updated_at
  BEFORE UPDATE ON public.platform_tax_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) platform_fee_invoices -----------------------------------------------
-- Real invoice: MyCleaner charges the provider the 28% platform commission.
CREATE TABLE public.platform_fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform_tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency text NOT NULL,
  subtotal_amount integer NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount integer NOT NULL DEFAULT 0,
  total_amount integer NOT NULL,
  vat_treatment text NOT NULL DEFAULT 'standard'
    CHECK (vat_treatment IN ('standard','reverse_charge','exempt','outside_scope')),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  pdf_storage_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_fee_invoices_provider_idx
  ON public.platform_fee_invoices(provider_user_id, issued_at DESC);
CREATE INDEX platform_fee_invoices_country_idx
  ON public.platform_fee_invoices((platform_tax_snapshot->>'country_code'), issued_at DESC);

GRANT SELECT ON public.platform_fee_invoices TO authenticated;
GRANT ALL ON public.platform_fee_invoices TO service_role;

ALTER TABLE public.platform_fee_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own platform fee invoices"
  ON public.platform_fee_invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = provider_user_id);

CREATE POLICY "Admins and employees view all platform fee invoices"
  ON public.platform_fee_invoices FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_platform_fee_invoices_updated_at
  BEFORE UPDATE ON public.platform_fee_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) provider_settlement_statements --------------------------------------
-- Financial settlement record — NOT a VAT invoice, NOT a MyCleaner sales
-- invoice. Providers remain responsible for their own customer invoicing
-- and VAT obligations.
CREATE TABLE public.provider_settlement_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_display_name text,
  service_date date,
  service_address text,
  currency text NOT NULL,
  gross_amount integer NOT NULL DEFAULT 0,
  refund_amount integer NOT NULL DEFAULT 0,
  platform_fee_amount integer NOT NULL DEFAULT 0,
  provider_net_amount integer NOT NULL DEFAULT 0,
  provider_tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payout_status text NOT NULL DEFAULT 'pending',
  linked_transfer_id text,
  linked_payout_id text,
  pdf_storage_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_settlement_statements_provider_idx
  ON public.provider_settlement_statements(provider_user_id, issued_at DESC);

GRANT SELECT ON public.provider_settlement_statements TO authenticated;
GRANT ALL ON public.provider_settlement_statements TO service_role;

ALTER TABLE public.provider_settlement_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own settlement statements"
  ON public.provider_settlement_statements FOR SELECT
  TO authenticated
  USING (auth.uid() = provider_user_id);

CREATE POLICY "Admins and employees view all settlement statements"
  ON public.provider_settlement_statements FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_provider_settlement_statements_updated_at
  BEFORE UPDATE ON public.provider_settlement_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) next_invoice_number(country_code) — atomic, gap-free per-country ----
CREATE OR REPLACE FUNCTION public.next_invoice_number(_country_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_seq bigint;
  v_year int := EXTRACT(YEAR FROM now())::int;
BEGIN
  UPDATE public.platform_tax_settings
     SET next_invoice_number = next_invoice_number + 1,
         updated_at = now()
   WHERE country_code = upper(_country_code)
  RETURNING invoice_series_prefix, next_invoice_number - 1
    INTO v_prefix, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'platform_tax_settings row missing for country %', _country_code;
  END IF;

  RETURN v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(text) TO service_role;

-- 6) Seed MyCleaner tax settings for 12 European countries ---------------
INSERT INTO public.platform_tax_settings
  (country_code, legal_entity_name, vat_rate, reverse_charge_eu, invoice_series_prefix, notes)
VALUES
  ('DK', 'MyCleaner ApS', 25.00, true,  'DK', 'Danish home market'),
  ('SE', 'MyCleaner ApS', 25.00, true,  'SE', 'EU reverse charge to VAT-registered providers'),
  ('NO', 'MyCleaner ApS', 25.00, false, 'NO', 'Non-EU; outside scope by default'),
  ('FI', 'MyCleaner ApS', 24.00, true,  'FI', null),
  ('DE', 'MyCleaner ApS', 19.00, true,  'DE', null),
  ('NL', 'MyCleaner ApS', 21.00, true,  'NL', null),
  ('BE', 'MyCleaner ApS', 21.00, true,  'BE', null),
  ('FR', 'MyCleaner ApS', 20.00, true,  'FR', null),
  ('ES', 'MyCleaner ApS', 21.00, true,  'ES', null),
  ('IT', 'MyCleaner ApS', 22.00, true,  'IT', null),
  ('PL', 'MyCleaner ApS', 23.00, true,  'PL', null),
  ('GB', 'MyCleaner ApS', 20.00, false, 'GB', 'Post-Brexit; outside EU reverse charge')
ON CONFLICT (country_code) DO NOTHING;
