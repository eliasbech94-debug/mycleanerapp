
-- =========================================================
-- Task 6 — GDPR foundation
-- =========================================================

-- ---------- gdpr_export_jobs ------------------------------
CREATE TABLE public.gdpr_export_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','ready','failed','expired','revoked')),
  format TEXT NOT NULL DEFAULT 'json'
    CHECK (format IN ('json','html','pdf','zip')),
  storage_path TEXT,
  file_bytes BIGINT,
  requested_ip TEXT,
  requested_ua TEXT,
  error_message TEXT,
  expires_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  download_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gdpr_export_jobs_user_idx ON public.gdpr_export_jobs(user_id, created_at DESC);
CREATE UNIQUE INDEX gdpr_export_jobs_one_active
  ON public.gdpr_export_jobs(user_id)
  WHERE status IN ('queued','running','ready');

GRANT SELECT, INSERT ON public.gdpr_export_jobs TO authenticated;
GRANT ALL ON public.gdpr_export_jobs TO service_role;
ALTER TABLE public.gdpr_export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own export jobs read" ON public.gdpr_export_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own export jobs insert" ON public.gdpr_export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_gdpr_export_jobs_updated
  BEFORE UPDATE ON public.gdpr_export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- account_deletion_requests ---------------------
CREATE TABLE public.account_deletion_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','deactivated','legal_retention','scheduled','completed','rejected','cancelled')),
  reason TEXT,
  requested_ip TEXT,
  requested_ua TEXT,
  deactivated_at TIMESTAMPTZ,
  scheduled_delete_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewer_user_id UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,
  rejection_legal_reason TEXT,
  legal_hold_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_deletion_requests_user_idx
  ON public.account_deletion_requests(user_id, created_at DESC);
CREATE UNIQUE INDEX account_deletion_requests_one_active
  ON public.account_deletion_requests(user_id)
  WHERE status IN ('requested','deactivated','legal_retention','scheduled');

GRANT SELECT, INSERT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own deletion read" ON public.account_deletion_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own deletion insert" ON public.account_deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_account_deletion_requests_updated
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- consent_ledger --------------------------------
CREATE TABLE public.consent_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL
    CHECK (consent_type IN (
      'terms','privacy','marketing_email','marketing_sms','push','analytics_cookies'
    )),
  policy_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  country_code TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consent_ledger_user_idx
  ON public.consent_ledger(user_id, consent_type, created_at DESC);

GRANT SELECT, INSERT ON public.consent_ledger TO authenticated;
GRANT ALL ON public.consent_ledger TO service_role;
ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own consent read" ON public.consent_ledger
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own consent insert" ON public.consent_ledger
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- consent ledger is append-only for users
CREATE OR REPLACE FUNCTION public.consent_ledger_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'consent_ledger is append-only';
END;
$$;
CREATE TRIGGER consent_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.consent_ledger
  FOR EACH ROW EXECUTE FUNCTION public.consent_ledger_immutable();


-- ---------- data_retention_policies -----------------------
CREATE TABLE public.data_retention_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_type TEXT NOT NULL UNIQUE,
  description TEXT,
  retention_days INT NOT NULL CHECK (retention_days >= 0),
  respects_legal_hold BOOLEAN NOT NULL DEFAULT true,
  action TEXT NOT NULL DEFAULT 'delete'
    CHECK (action IN ('delete','anonymise','archive')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.data_retention_policies TO authenticated;
GRANT ALL ON public.data_retention_policies TO service_role;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention read admin" ON public.data_retention_policies
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_data_retention_policies_updated
  BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- legal_holds -----------------------------------
CREATE TABLE public.legal_holds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('user','booking','dispute','payout','tax','other')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  released_by UUID REFERENCES auth.users(id),
  released_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX legal_holds_target_idx
  ON public.legal_holds(target_type, target_id) WHERE active;

GRANT SELECT ON public.legal_holds TO authenticated;
GRANT ALL ON public.legal_holds TO service_role;
ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal holds admin read" ON public.legal_holds
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_legal_holds_updated
  BEFORE UPDATE ON public.legal_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- retention_worker_runs -------------------------
CREATE TABLE public.retention_worker_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed')),
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

GRANT SELECT ON public.retention_worker_runs TO authenticated;
GRANT ALL ON public.retention_worker_runs TO service_role;
ALTER TABLE public.retention_worker_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention runs admin read" ON public.retention_worker_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));


-- ---------- helper: is target under legal hold ------------
CREATE OR REPLACE FUNCTION public.is_under_legal_hold(_target_type TEXT, _target_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.legal_holds
    WHERE target_type = _target_type
      AND target_id = _target_id
      AND active = true
      AND (ends_at IS NULL OR ends_at > now())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_under_legal_hold(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_under_legal_hold(TEXT, TEXT) TO authenticated, service_role;


-- ---------- seed default retention policies ---------------
INSERT INTO public.data_retention_policies (record_type, description, retention_days, action, respects_legal_hold) VALUES
  ('unverified_accounts', 'Auth users without verified email / phone', 30, 'delete', true),
  ('dormant_accounts', 'No login for N days — soft anonymise', 1095, 'anonymise', true),
  ('sms_verifications', 'One-time SMS codes', 7, 'delete', false),
  ('notification_outbox', 'Delivered notifications outbox rows', 90, 'delete', false),
  ('gdpr_export_files', 'Signed GDPR export archives', 7, 'delete', false),
  ('dispute_evidence', 'Uploaded dispute evidence files', 1825, 'delete', true),
  ('support_messages', 'Support chat messages', 730, 'anonymise', true),
  ('admin_audit_log', 'Immutable audit trail', 2555, 'archive', true),
  ('bookings', 'Completed / cancelled bookings', 1825, 'anonymise', true),
  ('finance_documents', 'Invoices, settlements, credit notes', 3650, 'archive', true)
ON CONFLICT (record_type) DO NOTHING;
