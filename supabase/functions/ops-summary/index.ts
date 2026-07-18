// Admin-only diagnostics for the operations dashboard.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const admin = ctx.admin;
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();

  const [
    alerts, incidents, errors24, webhook24, jobs24, deployments,
    outboxBacklog, disputesOpen, gdprJobs, retentionRuns, reconAlerts,
  ] = await Promise.all([
    admin.from("system_alerts").select("*").neq("status", "resolved")
      .order("last_seen_at", { ascending: false }).limit(50),
    admin.from("incidents").select("id, severity, status, title, opened_at, owner_user_id")
      .neq("status", "resolved").order("opened_at", { ascending: false }).limit(20),
    admin.from("error_events").select("source, level, error_category, occurred_at, function_name, route")
      .gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(200),
    admin.from("webhook_metrics").select("event_type, result, received_at, duration_ms")
      .gte("received_at", since).order("received_at", { ascending: false }).limit(200),
    admin.from("job_runs").select("job_name, status, started_at, duration_ms, failed_count, success_count")
      .gte("started_at", since).order("started_at", { ascending: false }).limit(100),
    admin.from("deployments").select("*").order("deployed_at", { ascending: false }).limit(10),
    admin.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("stripe_disputes").select("id", { count: "exact", head: true })
      .in("status", ["needs_response","warning_needs_response","under_review","warning_under_review"]),
    admin.from("gdpr_export_jobs").select("id", { count: "exact", head: true }).in("status", ["queued","running"]),
    admin.from("retention_worker_runs").select("*").order("started_at", { ascending: false }).limit(5),
    admin.from("finance_reconciliation_alerts").select("id", { count: "exact", head: true }).neq("status", "resolved"),
  ]);

  return json({
    generated_at: new Date().toISOString(),
    alerts: alerts.data ?? [],
    incidents: incidents.data ?? [],
    errors_24h: errors24.data ?? [],
    webhooks_24h: webhook24.data ?? [],
    jobs_24h: jobs24.data ?? [],
    deployments: deployments.data ?? [],
    counters: {
      notification_backlog: outboxBacklog.count ?? 0,
      open_disputes: disputesOpen.count ?? 0,
      gdpr_jobs_active: gdprJobs.count ?? 0,
      reconciliation_alerts_open: reconAlerts.count ?? 0,
    },
    retention_runs: retentionRuns.data ?? [],
  });
});
