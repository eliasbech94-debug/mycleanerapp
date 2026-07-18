// Scheduled monitor: raises alerts for stuck / missed / high-failure jobs.
// Reads job_runs + expected schedule table (data_retention_policies not relevant here).
// Auth: service-role (cron) or authenticated admin.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { monitored } from "../_shared/logger.ts";
import { requireServiceOrAdmin } from "../_shared/auth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Expected schedule per job. Values are seconds since the last completed run
// before we consider the job "missed". Tune conservatively.
const EXPECTED_INTERVAL_SECONDS: Record<string, number> = {
  "finance-reconcile": 26 * 3600,          // daily
  "dispute-monitor": 26 * 3600,            // daily
  "gdpr-retention-worker": 26 * 3600,      // daily
  "gdpr-export-worker": 15 * 60,           // every 10m
  "booking-expire-pending": 15 * 60,       // every 10m
  "booking-plan-reminders": 2 * 3600,      // hourly-ish
};

// Max duration before a run is considered stuck (seconds).
const MAX_RUN_DURATION_SECONDS = 30 * 60;

// Failure ratio window/threshold.
const FAILURE_WINDOW_HOURS = 24;
const FAILURE_RATIO_ALERT = 0.5;
const FAILURE_MIN_RUNS = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(monitored("stuck-job-monitor", async (req, log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireServiceOrAdmin(req, corsHeaders);
  if (guard instanceof Response) return guard;

  const nowMs = Date.now();
  const alerts: Array<Record<string, unknown>> = [];

  // 1) Stuck runs — started but not finished after MAX_RUN_DURATION_SECONDS
  const stuckCutoff = new Date(nowMs - MAX_RUN_DURATION_SECONDS * 1000).toISOString();
  const { data: stuck } = await admin
    .from("job_runs")
    .select("id, job_name, started_at, correlation_id")
    .is("finished_at", null)
    .lt("started_at", stuckCutoff)
    .limit(50);

  for (const r of stuck ?? []) {
    await admin.rpc("raise_system_alert", {
      _alert_key: `job_stuck:${r.job_name}:${r.id}`,
      _severity: "critical",
      _source: "stuck-job-monitor",
      _title: `Background job stuck: ${r.job_name}`,
      _body: `Run ${r.id} started at ${r.started_at} and has not finished.`,
      _correlation_id: r.correlation_id ?? null,
      _metadata: { job_name: r.job_name, run_id: r.id },
    });
    alerts.push({ type: "stuck", job: r.job_name, run: r.id });
  }

  // 2) Missed runs — last completed run older than expected interval
  for (const [job, interval] of Object.entries(EXPECTED_INTERVAL_SECONDS)) {
    const { data: latest } = await admin
      .from("job_runs")
      .select("finished_at, status")
      .eq("job_name", job)
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastMs = latest?.finished_at ? new Date(latest.finished_at).getTime() : 0;
    const ageSec = (nowMs - lastMs) / 1000;
    if (!latest || ageSec > interval) {
      await admin.rpc("raise_system_alert", {
        _alert_key: `job_missed:${job}`,
        _severity: "warning",
        _source: "stuck-job-monitor",
        _title: `Scheduled job missed: ${job}`,
        _body: latest
          ? `Last successful run was ${Math.round(ageSec / 60)} minutes ago (expected every ${Math.round(interval/60)} min).`
          : `No successful runs recorded for ${job}.`,
        _metadata: { job_name: job, expected_interval_seconds: interval, age_seconds: ageSec },
      });
      alerts.push({ type: "missed", job, age_seconds: ageSec });
    } else {
      // auto-resolve if fresh again
      await admin.rpc("resolve_system_alert", { _alert_key: `job_missed:${job}` });
    }
  }

  // 3) High failure ratio in window
  const since = new Date(nowMs - FAILURE_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data: recent } = await admin
    .from("job_runs")
    .select("job_name, status")
    .gte("started_at", since)
    .not("status", "is", null);

  const perJob: Record<string, { total: number; failed: number }> = {};
  for (const r of recent ?? []) {
    const j = perJob[r.job_name] ??= { total: 0, failed: 0 };
    j.total += 1;
    if (r.status === "failed") j.failed += 1;
  }
  for (const [job, s] of Object.entries(perJob)) {
    if (s.total < FAILURE_MIN_RUNS) continue;
    const ratio = s.failed / s.total;
    if (ratio >= FAILURE_RATIO_ALERT) {
      await admin.rpc("raise_system_alert", {
        _alert_key: `job_failure_ratio:${job}`,
        _severity: "critical",
        _source: "stuck-job-monitor",
        _title: `High failure rate: ${job}`,
        _body: `${s.failed}/${s.total} runs failed in last ${FAILURE_WINDOW_HOURS}h (${Math.round(ratio*100)}%).`,
        _metadata: { job_name: job, ratio, total: s.total, failed: s.failed },
      });
      alerts.push({ type: "failure_rate", job, ratio });
    } else {
      await admin.rpc("resolve_system_alert", { _alert_key: `job_failure_ratio:${job}` });
    }
  }

  // 4) Notification outbox backlog
  const { count: outboxBacklog } = await admin
    .from("notification_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("created_at", new Date(nowMs - 10 * 60 * 1000).toISOString());
  if ((outboxBacklog ?? 0) > 100) {
    await admin.rpc("raise_system_alert", {
      _alert_key: "queue_backlog:notification_outbox",
      _severity: "warning",
      _source: "stuck-job-monitor",
      _title: "Notification outbox backlog",
      _body: `${outboxBacklog} pending messages older than 10 minutes.`,
      _metadata: { backlog: outboxBacklog },
    });
    alerts.push({ type: "backlog", queue: "notification_outbox", size: outboxBacklog });
  } else {
    await admin.rpc("resolve_system_alert", { _alert_key: "queue_backlog:notification_outbox" });
  }

  log.info("stuck_job_monitor.done", { alerts_raised: alerts.length });
  return json({ ok: true, alerts_raised: alerts.length, alerts });
}));
