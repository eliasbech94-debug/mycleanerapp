// Admin-only detailed diagnostics. Returns per-subsystem status without leaking secrets.
// Public health endpoint is /health — this one requires admin role.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { monitored } from "../_shared/logger.ts";
import { requireServiceOrAdmin } from "../_shared/auth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Status = "healthy" | "degraded" | "unhealthy";
interface Check { name: string; status: Status; latency_ms?: number; note?: string; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function timed<T>(fn: () => PromiseLike<T>): Promise<[T | null, number, string | null]> {
  const t0 = performance.now();
  try {
    const v = await fn();
    return [v, Math.round(performance.now() - t0), null];
  } catch (e) {
    return [null, Math.round(performance.now() - t0), (e as Error).message];
  }
}

Deno.serve(monitored("admin-diagnostics", async (req, log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireServiceOrAdmin(req, corsHeaders);
  if (guard instanceof Response) return guard;

  const checks: Check[] = [];

  // DB round-trip
  {
    const [ok, ms, err] = await timed(() => admin.from("profiles").select("id", { head: true, count: "exact" }).limit(1));
    checks.push({ name: "database", status: err ? "unhealthy" : (ms > 800 ? "degraded" : "healthy"), latency_ms: ms, note: err ?? undefined });
  }

  // Stripe reachability (no secret exposure)
  {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) checks.push({ name: "stripe", status: "unhealthy", note: "no_key_configured" });
    else {
      const [_r, ms, err] = await timed(async () => {
        const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${key}` } });
        if (!r.ok) throw new Error(`status_${r.status}`);
        await r.text();
      });
      checks.push({ name: "stripe", status: err ? "unhealthy" : (ms > 1500 ? "degraded" : "healthy"), latency_ms: ms, note: err ?? undefined });
    }
  }

  // Storage buckets present
  {
    const [buckets, ms, err] = await timed(() => admin.storage.listBuckets());
    checks.push({ name: "storage", status: err ? "unhealthy" : "healthy", latency_ms: ms, note: err ?? `${buckets?.data?.length ?? 0} buckets` });
  }

  // Webhook freshness
  {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ count } = { count: 0 } as any, ms, err] = await timed(() =>
      admin.from("stripe_webhook_events").select("id", { head: true, count: "exact" }).gte("received_at", since)
    );
    checks.push({ name: "stripe_webhook", status: err ? "unhealthy" : "healthy", latency_ms: ms, note: `${count ?? 0} events / 24h` });
  }

  // Queue backlogs
  {
    const [{ count } = { count: 0 } as any, ms, err] = await timed(() =>
      admin.from("notification_outbox").select("id", { head: true, count: "exact" }).eq("status", "pending")
    );
    const backlog = count ?? 0;
    checks.push({
      name: "notification_outbox",
      status: err ? "unhealthy" : (backlog > 500 ? "unhealthy" : backlog > 100 ? "degraded" : "healthy"),
      latency_ms: ms, note: `${backlog} pending`,
    });
  }

  // Job runs — recent failure count
  {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ count: failed } = { count: 0 } as any, ms, err] = await timed(() =>
      admin.from("job_runs").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("started_at", since)
    );
    checks.push({
      name: "scheduled_jobs",
      status: err ? "unhealthy" : ((failed ?? 0) > 10 ? "degraded" : "healthy"),
      latency_ms: ms, note: `${failed ?? 0} failed / 24h`,
    });
  }

  // Delivery channels (config presence, not send test)
  checks.push({
    name: "email",
    status: Deno.env.get("RESEND_API_KEY") ? "healthy" : "degraded",
    note: Deno.env.get("RESEND_API_KEY") ? "configured" : "no_provider_configured",
  });
  checks.push({
    name: "push",
    status: Deno.env.get("FCM_SERVER_KEY") || Deno.env.get("VAPID_PUBLIC_KEY") ? "healthy" : "degraded",
    note: "config_only_check",
  });
  checks.push({
    name: "sms",
    status: Deno.env.get("GATEWAYAPI_API_TOKEN") ? "healthy" : "degraded",
    note: "config_only_check",
  });

  // Active alerts
  const { data: activeAlerts } = await admin
    .from("system_alerts").select("alert_key, severity, source, title, first_seen_at, seen_count")
    .neq("status", "resolved").order("first_seen_at", { ascending: false }).limit(50);

  const worst: Status = checks.some(c => c.status === "unhealthy")
    ? "unhealthy" : checks.some(c => c.status === "degraded") ? "degraded" : "healthy";

  log.info("admin_diagnostics.done", { worst, active_alerts: activeAlerts?.length ?? 0 });
  return json({
    overall: worst,
    checked_at: new Date().toISOString(),
    release: Deno.env.get("APP_RELEASE") ?? "unknown",
    environment: Deno.env.get("APP_ENVIRONMENT") ?? "production",
    checks,
    active_alerts: activeAlerts ?? [],
  });
}));
