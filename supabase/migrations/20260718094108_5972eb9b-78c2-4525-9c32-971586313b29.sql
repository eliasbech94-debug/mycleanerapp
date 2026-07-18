
-- ─────────────────────────────────────────────────────────────
-- 1) Immutable admin audit log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text,
  action text NOT NULL,
  target_type text,
  target_id text,
  booking_id uuid,
  previous_state jsonb,
  new_state jsonb,
  refund_amount integer,
  currency text,
  stripe_refund_id text,
  stripe_payment_intent_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_read" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Immutability: block UPDATE / DELETE for everyone except service_role bypass via trigger
CREATE OR REPLACE FUNCTION public.admin_audit_immutable()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_audit_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS admin_audit_no_update ON public.admin_audit_log;
CREATE TRIGGER admin_audit_no_update
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_immutable();

CREATE INDEX IF NOT EXISTS idx_audit_booking ON public.admin_audit_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.admin_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.admin_audit_log(action, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2) Notification outbox (multi-channel)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email','push','sms')),
  event_type text NOT NULL,
  subject text,
  body text,
  payload jsonb DEFAULT '{}'::jsonb,
  related_booking_id uuid,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  UNIQUE (user_id, channel, dedupe_key)
);

GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox_own_read" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.notification_outbox(status, channel, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_user ON public.notification_outbox(user_id, created_at DESC);

CREATE TRIGGER trg_outbox_updated_at BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 3) Finance reconciliation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  bookings_scanned integer NOT NULL DEFAULT 0,
  alerts_created integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  summary jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.finance_reconciliation_runs TO authenticated;
GRANT ALL ON public.finance_reconciliation_runs TO service_role;
ALTER TABLE public.finance_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recon_runs_admin_read" ON public.finance_reconciliation_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.finance_reconciliation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid REFERENCES public.finance_reconciliation_runs(id) ON DELETE SET NULL,
  booking_id uuid,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical')),
  code text NOT NULL,
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  UNIQUE (booking_id, code)
);
GRANT SELECT, UPDATE ON public.finance_reconciliation_alerts TO authenticated;
GRANT ALL ON public.finance_reconciliation_alerts TO service_role;
ALTER TABLE public.finance_reconciliation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recon_alerts_admin_read" ON public.finance_reconciliation_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "recon_alerts_admin_resolve" ON public.finance_reconciliation_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_recon_alerts_updated_at BEFORE UPDATE ON public.finance_reconciliation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_recon_alerts_open
  ON public.finance_reconciliation_alerts(severity, created_at DESC)
  WHERE resolved_at IS NULL;
