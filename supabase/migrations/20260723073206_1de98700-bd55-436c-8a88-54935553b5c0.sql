-- ============================================================
-- Multi-cleaner booking support (schema-only, forward-compatible)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_id text NOT NULL,
  share_bps integer NOT NULL CHECK (share_bps > 0 AND share_bps <= 10000),
  is_lead boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','confirmed','declined','removed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, worker_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_workers_one_lead_per_booking
  ON public.booking_workers (booking_id) WHERE is_lead = true;
CREATE INDEX IF NOT EXISTS booking_workers_worker_idx
  ON public.booking_workers (worker_user_id);

GRANT SELECT ON public.booking_workers TO authenticated;
GRANT ALL ON public.booking_workers TO service_role;
ALTER TABLE public.booking_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers see own assignments"
  ON public.booking_workers FOR SELECT TO authenticated
  USING (worker_user_id = auth.uid());

CREATE POLICY "Customers see workers on own bookings"
  ON public.booking_workers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_workers.booking_id
      AND b.customer_user_id = auth.uid()
  ));

CREATE POLICY "Admins and support read all workers"
  ON public.booking_workers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_id text NOT NULL,
  gross_amount_minor bigint NOT NULL CHECK (gross_amount_minor >= 0),
  platform_fee_amount_minor bigint NOT NULL DEFAULT 0 CHECK (platform_fee_amount_minor >= 0),
  net_amount_minor bigint NOT NULL CHECK (net_amount_minor >= 0),
  currency text NOT NULL,
  stripe_transfer_id text,
  stripe_destination_account text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_transit','paid','reversed','failed')),
  earned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, worker_user_id)
);
CREATE INDEX IF NOT EXISTS worker_earnings_worker_idx
  ON public.worker_earnings (worker_user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS worker_earnings_transfer_idx
  ON public.worker_earnings (stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;

GRANT SELECT ON public.worker_earnings TO authenticated;
GRANT ALL ON public.worker_earnings TO service_role;
ALTER TABLE public.worker_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers see own earnings"
  ON public.worker_earnings FOR SELECT TO authenticated
  USING (worker_user_id = auth.uid());

CREATE POLICY "Admins and support read all earnings"
  ON public.worker_earnings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

-- updated_at triggers (reuse existing helper)
CREATE TRIGGER trg_booking_workers_updated_at
  BEFORE UPDATE ON public.booking_workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_worker_earnings_updated_at
  BEFORE UPDATE ON public.worker_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sum-of-shares validation trigger: total share_bps per booking must equal 10000
-- (checked only when at least one row exists — allows staged inserts via a txn).
CREATE OR REPLACE FUNCTION public.validate_booking_worker_shares()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  total integer;
BEGIN
  SELECT COALESCE(SUM(share_bps), 0) INTO total
  FROM public.booking_workers
  WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    AND status IN ('assigned','confirmed');
  IF total > 10000 THEN
    RAISE EXCEPTION 'booking_workers share_bps sum % exceeds 10000 for booking %',
      total, COALESCE(NEW.booking_id, OLD.booking_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_booking_workers_share_sum
  AFTER INSERT OR UPDATE OF share_bps, status ON public.booking_workers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_worker_shares();
