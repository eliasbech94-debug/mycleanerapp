// User-initiated GDPR export request. Creates a job row; a scheduled worker
// (or an immediate follow-up invocation) generates the file.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit, requestFingerprint } from "../_shared/audit.ts";

import { monitored } from "../_shared/logger.ts";
Deno.serve(monitored("gdpr-export-request", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const uid = ctx.user.id;
  const fp = requestFingerprint(req);

  // Simple rate limit: 1 active job + max 3 in last 24h
  const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { count } = await ctx.admin
    .from("gdpr_export_jobs").select("id", { count: "exact", head: true })
    .eq("user_id", uid).gte("created_at", dayAgo);
  if ((count ?? 0) >= 3) return json({ error: "rate_limited", message: "Max 3 exportforespørgsler per 24 timer." }, 429);

  const { data: existing } = await ctx.admin
    .from("gdpr_export_jobs").select("id, status")
    .eq("user_id", uid).in("status", ["queued","running","ready"]).maybeSingle();
  if (existing) return json({ ok: true, job: existing, message: "Der findes allerede en aktiv eksportforespørgsel." });

  const { data: job, error } = await ctx.admin.from("gdpr_export_jobs").insert({
    user_id: uid, status: "queued", format: "json",
    requested_ip: fp.ip, requested_ua: fp.ua,
  }).select().single();
  if (error) return json({ error: error.message }, 500);

  await writeAudit(ctx.admin, req, {
    actor_user_id: uid, actor_role: ctx.roles[0] ?? null,
    action: "gdpr.export.requested", target_type: "gdpr_export_jobs", target_id: job.id,
  });

  // Fire-and-forget worker invocation
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${url}/functions/v1/gdpr-export-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc}` },
      body: JSON.stringify({ job_id: job.id }),
    }).catch(() => {});
  } catch { /* ignore */ }

  return json({ ok: true, job });
}));
