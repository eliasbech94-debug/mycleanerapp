import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ShieldAlert, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";

type Alert = { id: string; alert_key: string; severity: string; title: string; body: string | null; source: string; last_seen_at: string; seen_count: number };
type Incident = { id: string; severity: string; status: string; title: string; opened_at: string };
type Deployment = { id: string; release: string; environment: string; status: string; deployed_at: string };
type JobRun = { job_name: string; status: string; started_at: string; duration_ms: number | null; failed_count: number; success_count: number };
type ErrorRow = { source: string; level: string; error_category: string | null; function_name: string | null; route: string | null; occurred_at: string };
type WebhookRow = { event_type: string; result: string; received_at: string; duration_ms: number | null };

type Summary = {
  generated_at: string;
  alerts: Alert[];
  incidents: Incident[];
  errors_24h: ErrorRow[];
  webhooks_24h: WebhookRow[];
  jobs_24h: JobRun[];
  deployments: Deployment[];
  counters: {
    notification_backlog: number;
    open_disputes: number;
    gdpr_jobs_active: number;
    reconciliation_alerts_open: number;
  };
  retention_runs: any[];
};

function sevColor(s: string): "default" | "destructive" | "secondary" | "outline" {
  if (s === "critical" || s === "SEV-1" || s === "SEV-2") return "destructive";
  if (s === "warning" || s === "SEV-3") return "secondary";
  return "outline";
}

export default function AdminOps() {
  const { t } = useTranslation("admin");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ops-summary");
    setLoading(false);
    if (error) return toast.error(error.message);
    setData(data as Summary);
  }
  useEffect(() => { load(); }, []);

  async function resolveAlert(key: string) {
    const { error } = await supabase.functions.invoke("incident-manage", {
      body: { op: "resolve_alert", alert_key: key },
    });
    if (error) return toast.error(error.message);
    toast.success(t("ops.opsDashboard.alertResolved"));
    load();
  }

  const errorsByCategory = (data?.errors_24h ?? []).reduce<Record<string, number>>((a, e) => {
    const k = e.error_category ?? e.source; a[k] = (a[k] ?? 0) + 1; return a;
  }, {});
  const webhookFail = (data?.webhooks_24h ?? []).filter(w => w.result === "failed" || w.result === "signature_invalid" || w.result === "dead_letter");
  const jobFailures = (data?.jobs_24h ?? []).filter(j => j.status === "failed" || j.failed_count > 0);

  const overallHealth: "healthy" | "warning" | "critical" =
    (data?.alerts.some(a => a.severity === "critical") ? "critical"
     : data?.alerts.some(a => a.severity === "warning") ? "warning"
     : "healthy");

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <BackButton />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-serif">{t("ops.opsDashboard.title")}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={sevColor(overallHealth)} className="uppercase">
            {overallHealth === "healthy" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
            {t(`ops.opsDashboard.health.${overallHealth}`)}
          </Badge>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={t("ops.opsDashboard.kpi.notificationBacklog")} value={data?.counters.notification_backlog ?? 0} threshold={100} />
        <Kpi label={t("ops.opsDashboard.kpi.openDisputes")} value={data?.counters.open_disputes ?? 0} threshold={5} />
        <Kpi label={t("ops.opsDashboard.kpi.gdprJobsActive")} value={data?.counters.gdpr_jobs_active ?? 0} threshold={10} />
        <Kpi label={t("ops.opsDashboard.kpi.reconciliationMismatch")} value={data?.counters.reconciliation_alerts_open ?? 0} threshold={1} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> {t("ops.opsDashboard.openAlerts.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data?.alerts ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("ops.opsDashboard.openAlerts.empty")}</p>}
          {(data?.alerts ?? []).map(a => (
            <div key={a.id} className="flex items-center justify-between border rounded p-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={sevColor(a.severity)}>{a.severity}</Badge>
                  <span className="font-medium">{a.title}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("ops.opsDashboard.openAlerts.meta", { source: a.source, lastSeen: new Date(a.last_seen_at).toLocaleString("da-DK"), count: a.seen_count })}
                </div>
                {a.body && <div className="text-sm mt-1">{a.body}</div>}
              </div>
              <Button size="sm" variant="outline" onClick={() => resolveAlert(a.alert_key)}>{t("ops.opsDashboard.openAlerts.resolve")}</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>{t("ops.opsDashboard.errors24h.title")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {Object.entries(errorsByCategory).sort((a,b) => b[1]-a[1]).slice(0,10).map(([k,v]) => (
              <div key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{v}</span></div>
            ))}
            {Object.keys(errorsByCategory).length === 0 && <p className="text-muted-foreground">{t("ops.opsDashboard.errors24h.empty")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("ops.opsDashboard.webhookFailures.title")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {webhookFail.slice(0,10).map((w,i) => (
              <div key={i} className="flex justify-between">
                <span>{w.event_type}</span>
                <Badge variant="destructive">{w.result}</Badge>
              </div>
            ))}
            {webhookFail.length === 0 && <p className="text-muted-foreground">{t("ops.opsDashboard.webhookFailures.empty")}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("ops.opsDashboard.backgroundJobs.title")}</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {jobFailures.slice(0,10).map((j,i) => (
            <div key={i} className="flex justify-between border-b py-1">
              <span>{j.job_name}</span>
              <span className="text-muted-foreground">{t("ops.opsDashboard.backgroundJobs.duration", { duration: j.duration_ms ?? "–", failed: j.failed_count })}</span>
            </div>
          ))}
          {jobFailures.length === 0 && <p className="text-muted-foreground">{t("ops.opsDashboard.backgroundJobs.empty")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("ops.opsDashboard.openIncidents.title")}</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {(data?.incidents ?? []).map(i => (
            <div key={i.id} className="flex justify-between border-b py-1">
              <span>
                <Badge variant={sevColor(i.severity)} className="mr-2">{i.severity}</Badge>
                {i.title}
              </span>
              <span className="text-muted-foreground">{i.status} · {new Date(i.opened_at).toLocaleDateString("da-DK")}</span>
            </div>
          ))}
          {(data?.incidents ?? []).length === 0 && <p className="text-muted-foreground">{t("ops.opsDashboard.openIncidents.empty")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("ops.opsDashboard.recentDeployments.title")}</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {(data?.deployments ?? []).map(d => (
            <div key={d.id} className="flex justify-between border-b py-1">
              <span>{d.release} <span className="text-muted-foreground">({d.environment})</span></span>
              <span>{d.status} · {new Date(d.deployed_at).toLocaleString("da-DK")}</span>
            </div>
          ))}
          {(data?.deployments ?? []).length === 0 && <p className="text-muted-foreground">{t("ops.opsDashboard.recentDeployments.empty")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  const { t } = useTranslation("admin");
  const level = value === 0 ? "healthy" : value >= threshold ? "critical" : "warning";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <Badge variant={sevColor(level)}>{t(`ops.opsDashboard.health.${level}`)}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
