
-- ── Extend bookings with cancellation audit fields ────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_role text
    CHECK (cancelled_by_role IN ('customer','provider','admin','system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ── booking_cancellations audit table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('customer','provider','admin','system')),
  reason_code text NOT NULL,
  reason_note text,
  refund_amount integer NOT NULL DEFAULT 0,
  refund_type text NOT NULL DEFAULT 'none' CHECK (refund_type IN ('none','partial','full')),
  currency text NOT NULL,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_refund_id text,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_cancellations_booking_idx ON public.booking_cancellations(booking_id);
CREATE INDEX IF NOT EXISTS booking_cancellations_actor_idx ON public.booking_cancellations(actor_user_id);

GRANT SELECT ON public.booking_cancellations TO authenticated;
GRANT ALL ON public.booking_cancellations TO service_role;

ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Actors see own cancellations" ON public.booking_cancellations
  FOR SELECT TO authenticated
  USING (auth.uid() = actor_user_id);

CREATE POLICY "Booking parties see cancellations on their booking"
  ON public.booking_cancellations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.profiles p ON p.provider_id = b.provider_id
    WHERE b.id = booking_cancellations.booking_id
      AND (b.customer_user_id = auth.uid() OR p.id = auth.uid())
  ));

CREATE POLICY "Admins & employees see all cancellations"
  ON public.booking_cancellations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'employee'::app_role));

-- ── platform_credit_notes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_invoice_id uuid NOT NULL REFERENCES public.platform_fee_invoices(id) ON DELETE RESTRICT,
  stripe_refund_id text,
  currency text NOT NULL,
  refund_amount integer NOT NULL,
  refund_type text NOT NULL CHECK (refund_type IN ('partial','full')),
  reversed_subtotal integer NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  reversed_vat_amount integer NOT NULL DEFAULT 0,
  reversed_total integer NOT NULL,
  vat_treatment text NOT NULL,
  provider_tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform_tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_storage_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (original_invoice_id, stripe_refund_id)
);

CREATE INDEX IF NOT EXISTS platform_credit_notes_provider_idx
  ON public.platform_credit_notes(provider_user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS platform_credit_notes_booking_idx
  ON public.platform_credit_notes(booking_id);
CREATE INDEX IF NOT EXISTS platform_credit_notes_refund_idx
  ON public.platform_credit_notes(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;

GRANT SELECT ON public.platform_credit_notes TO authenticated;
GRANT ALL ON public.platform_credit_notes TO service_role;

ALTER TABLE public.platform_credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view own credit notes"
  ON public.platform_credit_notes FOR SELECT TO authenticated
  USING (auth.uid() = provider_user_id);

CREATE POLICY "Admins & employees view all credit notes"
  ON public.platform_credit_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_platform_credit_notes_updated_at
  BEFORE UPDATE ON public.platform_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── refund_requests (idempotency ledger) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('customer','provider','admin','system')),
  requested_amount integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','succeeded','failed','duplicate')),
  stripe_refund_id text,
  stripe_error text,
  response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_requests_booking_idx ON public.refund_requests(booking_id);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON public.refund_requests(status);

-- Backend-only: no grants to anon/authenticated. Service role only.
GRANT ALL ON public.refund_requests TO service_role;

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
-- No policies = no client access. Only service_role bypasses RLS.

CREATE TRIGGER update_refund_requests_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Credit-note numbering (reuses platform_tax_settings series) ───────────
CREATE OR REPLACE FUNCTION public.next_credit_note_number(_country_code text)
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

  RETURN v_prefix || '-CN-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_credit_note_number(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_credit_note_number(text) TO service_role;
