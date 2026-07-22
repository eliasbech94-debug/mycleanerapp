
-- ============ stripe_disputes ============
CREATE TABLE public.stripe_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id TEXT NOT NULL UNIQUE,
  stripe_charge_id TEXT,
  stripe_payment_intent_id TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_id TEXT,
  amount BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DKK',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'needs_response', -- warning_needs_response|warning_under_review|warning_closed|needs_response|under_review|charge_refunded|won|lost
  outcome TEXT,
  evidence_due_by TIMESTAMPTZ,
  has_evidence BOOLEAN NOT NULL DEFAULT false,
  submission_count INT NOT NULL DEFAULT 0,
  funds_withdrawn_at TIMESTAMPTZ,
  funds_reinstated_at TIMESTAMPTZ,
  is_charge_refundable BOOLEAN,
  livemode BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stripe_disputes_booking ON public.stripe_disputes(booking_id);
CREATE INDEX idx_stripe_disputes_provider_user ON public.stripe_disputes(provider_user_id);
CREATE INDEX idx_stripe_disputes_customer_user ON public.stripe_disputes(customer_user_id);
CREATE INDEX idx_stripe_disputes_status ON public.stripe_disputes(status);
CREATE INDEX idx_stripe_disputes_due ON public.stripe_disputes(evidence_due_by);

GRANT SELECT ON public.stripe_disputes TO authenticated;
GRANT ALL ON public.stripe_disputes TO service_role;

ALTER TABLE public.stripe_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all disputes"
  ON public.stripe_disputes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Provider reads own disputes"
  ON public.stripe_disputes FOR SELECT TO authenticated
  USING (provider_user_id = auth.uid());

CREATE POLICY "Customer reads own disputes"
  ON public.stripe_disputes FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());

CREATE TRIGGER trg_stripe_disputes_updated
  BEFORE UPDATE ON public.stripe_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ dispute_evidence ============
CREATE TABLE public.dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.stripe_disputes(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_role TEXT NOT NULL, -- 'provider' | 'admin'
  kind TEXT NOT NULL,          -- 'file' | 'note'
  storage_path TEXT,           -- dispute-evidence bucket path
  file_name TEXT,
  content_type TEXT,
  file_size BIGINT,
  note TEXT,
  stripe_field TEXT,           -- optional: which evidence field this maps to (e.g. receipt, service_documentation)
  submitted_to_stripe_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dispute_evidence_dispute ON public.dispute_evidence(dispute_id);

GRANT SELECT, INSERT ON public.dispute_evidence TO authenticated;
GRANT ALL ON public.dispute_evidence TO service_role;

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all evidence"
  ON public.dispute_evidence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Provider reads evidence on own disputes"
  ON public.dispute_evidence FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stripe_disputes d
    WHERE d.id = dispute_id AND d.provider_user_id = auth.uid()
  ));

CREATE POLICY "Provider inserts evidence on own disputes"
  ON public.dispute_evidence FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stripe_disputes d
      WHERE d.id = dispute_id AND d.provider_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins insert evidence"
  ON public.dispute_evidence FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND uploaded_by = auth.uid());

-- ============ dispute_alerts ============
CREATE TABLE public.dispute_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES public.stripe_disputes(id) ON DELETE CASCADE,
  code TEXT NOT NULL, -- 'deadline_approaching' | 'high_dispute_rate' | 'chargeback_ratio_exceeded'
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dispute_id, code)
);
CREATE INDEX idx_dispute_alerts_open ON public.dispute_alerts(code) WHERE resolved_at IS NULL;

GRANT SELECT, UPDATE ON public.dispute_alerts TO authenticated;
GRANT ALL ON public.dispute_alerts TO service_role;

ALTER TABLE public.dispute_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read alerts"
  ON public.dispute_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins resolve alerts"
  ON public.dispute_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ storage.objects RLS for dispute-evidence bucket ============
CREATE POLICY "Providers read own dispute evidence files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispute-evidence' AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Providers upload own dispute evidence files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-evidence' AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Admins manage dispute evidence files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'dispute-evidence' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'dispute-evidence' AND public.has_role(auth.uid(), 'admin'));

-- ============ Cron: daily dispute monitor ============
-- Guarded: pg_cron is not available on fresh Supabase projects by default.
-- If the `cron` schema is missing, skip scheduling and emit a NOTICE.
-- Idempotent: uses unschedule-if-exists before re-scheduling.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule('dispute-monitor-daily');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'dispute-monitor-daily',
      '15 4 * * *',
      $cron$
      SELECT net.http_post(
        url:='https://qfjgifubavuomwvroahy.supabase.co/functions/v1/dispute-monitor',
        headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmamdpZnViYXZ1b213dnJvYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5ODg2MTEsImV4cCI6MjA5NjU2NDYxMX0.XHCdkV5NXExJsZYEoTH4yrXWrdYpqOYrPX3ERa8mU4Q"}'::jsonb,
        body:='{"source":"cron"}'::jsonb
      );
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; skipping dispute-monitor-daily schedule.';
  END IF;
END
$do$;
