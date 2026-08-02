-- Provider mini-bookkeeping foundation
-- Combines settled MyCleaner earnings, platform fees, approved expenses and confirmed mileage.

CREATE TABLE IF NOT EXISTS public.provider_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  expense_date date NOT NULL,
  country_code text NOT NULL,
  currency text NOT NULL,
  merchant_name text,
  description text NOT NULL DEFAULT '',
  category_code text NOT NULL DEFAULT 'other',
  gross_amount numeric(14,2) NOT NULL,
  vat_amount numeric(14,2),
  net_amount numeric(14,2),
  deductible_percentage numeric(5,2) NOT NULL DEFAULT 100,
  deductible_amount numeric(14,2)
    GENERATED ALWAYS AS (round((gross_amount * deductible_percentage / 100.0)::numeric, 2)) STORED,
  receipt_storage_path text,
  receipt_file_name text,
  receipt_mime_type text,
  extraction_source text NOT NULL DEFAULT 'manual'
    CHECK (extraction_source IN ('manual','ocr','ai','import')),
  extraction_confidence numeric(5,4),
  extraction_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','needs_review','approved','rejected')),
  provider_confirmed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (country_code = upper(country_code) AND char_length(country_code) = 2),
  CHECK (gross_amount >= 0),
  CHECK (vat_amount IS NULL OR (vat_amount >= 0 AND vat_amount <= gross_amount)),
  CHECK (net_amount IS NULL OR (net_amount >= 0 AND net_amount <= gross_amount)),
  CHECK (
    vat_amount IS NULL
    OR net_amount IS NULL
    OR abs((net_amount + vat_amount) - gross_amount) <= 0.01
  ),
  CHECK (deductible_percentage >= 0 AND deductible_percentage <= 100),
  CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
  CHECK ((status = 'approved' AND provider_confirmed_at IS NOT NULL) OR status <> 'approved')
);

CREATE INDEX IF NOT EXISTS provider_expenses_provider_month_idx
  ON public.provider_expenses(provider_id, expense_date DESC);

ALTER TABLE public.provider_expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.provider_expenses TO authenticated;
GRANT ALL ON public.provider_expenses TO service_role;

DROP POLICY IF EXISTS "Providers read own expenses" ON public.provider_expenses;
CREATE POLICY "Providers read own expenses" ON public.provider_expenses
  FOR SELECT TO authenticated
  USING (public.user_owns_provider(provider_id));

DROP POLICY IF EXISTS "Providers create own expenses" ON public.provider_expenses;
CREATE POLICY "Providers create own expenses" ON public.provider_expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_provider(provider_id));

DROP POLICY IF EXISTS "Providers update own expenses" ON public.provider_expenses;
CREATE POLICY "Providers update own expenses" ON public.provider_expenses
  FOR UPDATE TO authenticated
  USING (public.user_owns_provider(provider_id))
  WITH CHECK (public.user_owns_provider(provider_id));

CREATE OR REPLACE FUNCTION public.enforce_provider_expense_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.country_code := upper(NEW.country_code);

  IF NEW.status = 'approved' AND NEW.provider_confirmed_at IS NULL THEN
    NEW.provider_confirmed_at := now();
  ELSIF NEW.status <> 'approved' THEN
    NEW.provider_confirmed_at := NULL;
  END IF;

  IF NEW.vat_amount IS NOT NULL THEN
    IF NEW.vat_amount > NEW.gross_amount THEN
      RAISE EXCEPTION 'vat_amount cannot exceed gross_amount';
    END IF;
    NEW.net_amount := round((NEW.gross_amount - NEW.vat_amount)::numeric, 2);
  ELSIF NEW.net_amount IS NULL THEN
    NEW.net_amount := NEW.gross_amount;
  ELSIF NEW.net_amount > NEW.gross_amount THEN
    RAISE EXCEPTION 'net_amount cannot exceed gross_amount';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_provider_expense_integrity_trigger ON public.provider_expenses;
CREATE TRIGGER enforce_provider_expense_integrity_trigger
  BEFORE INSERT OR UPDATE ON public.provider_expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_expense_integrity();

CREATE OR REPLACE VIEW public.provider_bookkeeping_monthly_summary
WITH (security_invoker = true)
AS
WITH booking_totals AS (
  SELECT
    provider_id,
    date_trunc('month', booking_date)::date AS month,
    upper(coalesce(country_code, 'DK')) AS country_code,
    currency,
    count(*) FILTER (WHERE status = 'completed') AS completed_bookings,
    coalesce(sum(provider_gets) FILTER (WHERE status = 'completed'), 0)::numeric(14,2) AS provider_income,
    coalesce(sum(platform_fee_amount) FILTER (WHERE status = 'completed'), 0)::numeric(14,2) AS platform_fees,
    coalesce(sum(customer_pays) FILTER (WHERE status = 'completed'), 0)::numeric(14,2) AS customer_gross_volume
  FROM public.bookings
  GROUP BY provider_id, date_trunc('month', booking_date), upper(coalesce(country_code, 'DK')), currency
),
expense_totals AS (
  SELECT
    provider_id,
    date_trunc('month', expense_date)::date AS month,
    country_code,
    currency,
    count(*) FILTER (WHERE status = 'approved') AS approved_expenses_count,
    count(*) FILTER (WHERE status IN ('draft','needs_review')) AS pending_expenses_count,
    coalesce(sum(gross_amount) FILTER (WHERE status = 'approved'), 0)::numeric(14,2) AS approved_expenses_gross,
    coalesce(sum(deductible_amount) FILTER (WHERE status = 'approved'), 0)::numeric(14,2) AS approved_deductible_expenses,
    coalesce(sum(vat_amount) FILTER (WHERE status = 'approved'), 0)::numeric(14,2) AS expense_vat
  FROM public.provider_expenses
  GROUP BY provider_id, date_trunc('month', expense_date), country_code, currency
),
mileage_totals AS (
  SELECT
    provider_id,
    month,
    country_code,
    currency,
    confirmed_trips,
    pending_trips,
    confirmed_distance_km,
    estimated_allowance_amount
  FROM public.provider_mileage_monthly_summary
),
keys AS (
  SELECT provider_id, month, country_code, currency FROM booking_totals
  UNION
  SELECT provider_id, month, country_code, currency FROM expense_totals
  UNION
  SELECT provider_id, month, country_code, currency FROM mileage_totals
)
SELECT
  k.provider_id,
  k.month,
  k.country_code,
  k.currency,
  coalesce(b.completed_bookings, 0) AS completed_bookings,
  coalesce(b.provider_income, 0)::numeric(14,2) AS provider_income,
  coalesce(b.platform_fees, 0)::numeric(14,2) AS platform_fees,
  coalesce(b.customer_gross_volume, 0)::numeric(14,2) AS customer_gross_volume,
  coalesce(e.approved_expenses_count, 0) AS approved_expenses_count,
  coalesce(e.pending_expenses_count, 0) AS pending_expenses_count,
  coalesce(e.approved_expenses_gross, 0)::numeric(14,2) AS approved_expenses_gross,
  coalesce(e.approved_deductible_expenses, 0)::numeric(14,2) AS approved_deductible_expenses,
  coalesce(e.expense_vat, 0)::numeric(14,2) AS expense_vat,
  coalesce(m.confirmed_trips, 0) AS confirmed_mileage_trips,
  coalesce(m.pending_trips, 0) AS pending_mileage_trips,
  coalesce(m.confirmed_distance_km, 0)::numeric(14,3) AS confirmed_distance_km,
  coalesce(m.estimated_allowance_amount, 0)::numeric(14,2) AS estimated_mileage_amount,
  (
    coalesce(b.provider_income, 0)
    - coalesce(e.approved_deductible_expenses, 0)
    - coalesce(m.estimated_allowance_amount, 0)
  )::numeric(14,2) AS preliminary_amount_to_register,
  (coalesce(e.pending_expenses_count, 0) > 0 OR coalesce(m.pending_trips, 0) > 0) AS has_pending_items
FROM keys k
LEFT JOIN booking_totals b USING (provider_id, month, country_code, currency)
LEFT JOIN expense_totals e USING (provider_id, month, country_code, currency)
LEFT JOIN mileage_totals m USING (provider_id, month, country_code, currency);

GRANT SELECT ON public.provider_bookkeeping_monthly_summary TO authenticated;

COMMENT ON TABLE public.provider_expenses IS
  'Provider-approved business expenses. AI/OCR output is a suggestion until the provider confirms it.';
COMMENT ON VIEW public.provider_bookkeeping_monthly_summary IS
  'Preliminary bookkeeping overview. preliminary_amount_to_register is informational and must not be presented as a final tax filing amount.';
