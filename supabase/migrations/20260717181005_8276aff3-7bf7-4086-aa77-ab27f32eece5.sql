
-- =========================================================================
-- Financial Marketplace foundation (additive)
-- =========================================================================

-- 1) finance_payouts ------------------------------------------------------
CREATE TABLE public.finance_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,
  stripe_charge_id TEXT,
  stripe_payment_intent_id TEXT,
  gross_amount INTEGER NOT NULL DEFAULT 0,          -- minor units (øre)
  platform_fee_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DKK',
  status TEXT NOT NULL DEFAULT 'pending',           -- pending|paid|failed|in_transit
  description TEXT,
  arrival_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_payouts_transfer_unique
  ON public.finance_payouts(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;
CREATE UNIQUE INDEX finance_payouts_payout_unique
  ON public.finance_payouts(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;
CREATE INDEX finance_payouts_provider_idx ON public.finance_payouts(provider_user_id, created_at DESC);
CREATE INDEX finance_payouts_booking_idx ON public.finance_payouts(booking_id);
CREATE INDEX finance_payouts_status_idx ON public.finance_payouts(status);

GRANT SELECT ON public.finance_payouts TO authenticated;
GRANT ALL ON public.finance_payouts TO service_role;

ALTER TABLE public.finance_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own payouts"
  ON public.finance_payouts FOR SELECT TO authenticated
  USING (auth.uid() = provider_user_id);

CREATE POLICY "Admins and employees view all payouts"
  ON public.finance_payouts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_finance_payouts_updated_at
  BEFORE UPDATE ON public.finance_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) finance_statements ---------------------------------------------------
CREATE TABLE public.finance_statements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DKK',
  gross_total INTEGER NOT NULL DEFAULT 0,
  platform_fee_total INTEGER NOT NULL DEFAULT 0,
  net_total INTEGER NOT NULL DEFAULT 0,
  bookings_count INTEGER NOT NULL DEFAULT 0,
  payouts_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',             -- draft|finalized
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_user_id, period_start, period_end, currency)
);
CREATE INDEX finance_statements_provider_idx
  ON public.finance_statements(provider_user_id, period_start DESC);

GRANT SELECT ON public.finance_statements TO authenticated;
GRANT ALL ON public.finance_statements TO service_role;

ALTER TABLE public.finance_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own statements"
  ON public.finance_statements FOR SELECT TO authenticated
  USING (auth.uid() = provider_user_id);

CREATE POLICY "Admins and employees view all statements"
  ON public.finance_statements FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_finance_statements_updated_at
  BEFORE UPDATE ON public.finance_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) finance_settings -----------------------------------------------------
CREATE TABLE public.finance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL UNIQUE,                -- ISO-3166-1 alpha-2 uppercase
  currency TEXT NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,         -- e.g. 25.00
  platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 28.00,
  invoice_series_prefix TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.finance_settings TO authenticated;
GRANT ALL ON public.finance_settings TO service_role;

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read finance settings"
  ON public.finance_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage finance settings"
  ON public.finance_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_finance_settings_updated_at
  BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults (safe upsert)
INSERT INTO public.finance_settings (country_code, currency, vat_rate, platform_fee_pct) VALUES
  ('DK','DKK',25.00,28.00),
  ('SE','SEK',25.00,28.00),
  ('NO','NOK',25.00,28.00),
  ('DE','EUR',19.00,28.00),
  ('FR','EUR',20.00,28.00),
  ('ES','EUR',21.00,28.00),
  ('NL','EUR',21.00,28.00),
  ('BE','EUR',21.00,28.00),
  ('AT','EUR',20.00,28.00),
  ('IT','EUR',22.00,28.00),
  ('PL','PLN',23.00,28.00),
  ('FI','EUR',24.00,28.00)
ON CONFLICT (country_code) DO NOTHING;
