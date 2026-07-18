
-- =========================================================
-- Task 7 — Observability & incident response
-- =========================================================

-- ---------- error_events ---------------------------------
CREATE TABLE public.error_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('frontend','edge_function','db','job','webhook','external')),
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('debug','info','warning','error','fatal')),
  environment TEXT,
  release TEXT,
  function_name TEXT,
  route TEXT,
  message TEXT NOT NULL,
  error_category TEXT,
  stack TEXT,
  correlation_id TEXT,
  request_id TEXT,
  user_id UUID,
  booking_id UUID,
  payment_id TEXT,
  dispute_id UUID,
  job_id UUID,
  duration_ms INT,
  status_code INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX error_events_occurred_idx ON public.error_events (occurred_at DESC);
CREATE INDEX error_events_source_idx ON public.error_events (source, occurred_at DESC);
CREATE INDEX error_events_corr_idx ON public.error_events (correlation_id) WHERE correlation_id IS NOT NULL;

GRANT SELECT, INSERT ON public.error_events TO authenticated;
GRANT ALL ON public.error_events TO service_role;
ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own errors insert" ON public.error_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "errors admin read" ON public.error_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ---------- job_runs -------------------------------------
CREATE TABLE public.job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','stuck','cancelled')),
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  duration_ms INT,
  deployment_release TEXT,
  correlation_id TEXT,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX job_runs_job_started_idx ON public.job_runs (job_name, started_at DESC);
CREATE INDEX job_runs_status_idx ON public.job_runs (status, started_at DESC);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job runs admin read" ON public.job_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));


-- ---------- webhook_metrics ------------------------------
CREATE TABLE public.webhook_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  duration_ms INT,
  attempt_count INT NOT NULL DEFAULT 1,
  result TEXT NOT NULL DEFAULT 'received'
    CHECK (result IN ('received','processed','duplicate','failed','signature_invalid','unknown_type','dead_letter')),
  error_category TEXT,
  correlation_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX webhook_metrics_event_attempt_idx
  ON public.webhook_metrics (provider, event_id, attempt_count);
CREATE INDEX webhook_metrics_received_idx ON public.webhook_metrics (received_at DESC);
CREATE INDEX webhook_metrics_result_idx ON public.webhook_metrics (result, received_at DESC);

GRANT SELECT ON public.webhook_metrics TO authenticated;
GRANT ALL ON public.webhook_metrics TO service_role;
ALTER TABLE public.webhook_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook metrics admin read" ON public.webhook_metrics
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));


-- ---------- system_alerts (deduped) ----------------------
CREATE TABLE public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','resolved')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INT NOT NULL DEFAULT 1,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  correlation_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX system_alerts_open_key_idx
  ON public.system_alerts (alert_key) WHERE status <> 'resolved';
CREATE INDEX system_alerts_last_seen_idx ON public.system_alerts (last_seen_at DESC);

GRANT SELECT, UPDATE ON public.system_alerts TO authenticated;
GRANT ALL ON public.system_alerts TO service_role;
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts admin read" ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "alerts admin update" ON public.system_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));


-- ---------- incidents ------------------------------------
CREATE TABLE public.incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'SEV-3'
    CHECK (severity IN ('SEV-1','SEV-2','SEV-3','SEV-4')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','mitigated','resolved','postmortem')),
  title TEXT NOT NULL,
  summary TEXT,
  owner_user_id UUID REFERENCES auth.users(id),
  opened_by UUID REFERENCES auth.users(id),
  linked_alert_ids UUID[] NOT NULL DEFAULT '{}',
  linked_deployment_ids UUID[] NOT NULL DEFAULT '{}',
  linked_booking_ids UUID[] NOT NULL DEFAULT '{}',
  linked_payment_ids TEXT[] NOT NULL DEFAULT '{}',
  root_cause TEXT,
  resolution TEXT,
  follow_up_actions TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX incidents_status_idx ON public.incidents (status, opened_at DESC);

GRANT SELECT ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidents admin read" ON public.incidents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_incidents_updated
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- incident_timeline ----------------------------
CREATE TABLE public.incident_timeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('note','status_change','alert_linked','deployment_linked','mitigation','resolution')),
  message TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX incident_timeline_incident_idx
  ON public.incident_timeline (incident_id, created_at);

GRANT SELECT ON public.incident_timeline TO authenticated;
GRANT ALL ON public.incident_timeline TO service_role;
ALTER TABLE public.incident_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incident timeline admin read" ON public.incident_timeline
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));


-- ---------- deployments ----------------------------------
CREATE TABLE public.deployments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  commit_sha TEXT,
  migration_version TEXT,
  edge_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('in_progress','succeeded','failed','rolled_back')),
  rolled_back_from UUID REFERENCES public.deployments(id),
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
CREATE INDEX deployments_deployed_idx ON public.deployments (deployed_at DESC);

GRANT SELECT ON public.deployments TO authenticated;
GRANT ALL ON public.deployments TO service_role;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deployments admin read" ON public.deployments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));


-- ---------- helper: upsert deduped alert -----------------
CREATE OR REPLACE FUNCTION public.raise_system_alert(
  _alert_key TEXT,
  _severity TEXT,
  _source TEXT,
  _title TEXT,
  _body TEXT DEFAULT NULL,
  _correlation_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.system_alerts (
    alert_key, severity, source, title, body, correlation_id, metadata
  ) VALUES (
    _alert_key, _severity, _source, _title, _body, _correlation_id, COALESCE(_metadata, '{}'::jsonb)
  )
  ON CONFLICT (alert_key) WHERE status <> 'resolved'
  DO UPDATE SET
    last_seen_at = now(),
    seen_count = public.system_alerts.seen_count + 1,
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = COALESCE(EXCLUDED.body, public.system_alerts.body),
    metadata = COALESCE(EXCLUDED.metadata, public.system_alerts.metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.raise_system_alert(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raise_system_alert(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_system_alert(
  _alert_key TEXT,
  _resolver UUID DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.system_alerts
     SET status = 'resolved',
         resolved_at = now(),
         resolved_by = _resolver
   WHERE alert_key = _alert_key AND status <> 'resolved';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_system_alert(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_system_alert(TEXT,UUID) TO service_role;

CREATE TRIGGER trg_deployments_dummy
  BEFORE UPDATE ON public.deployments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
