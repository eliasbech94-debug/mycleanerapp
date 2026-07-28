// STAGING_REQUIRED — Do NOT copy into supabase/functions/ before staging sign-off.
//
// Signed download for verified incident evidence ONLY.
// Guards:
//   - evidence.status = 'verified'
//   - evidence.final_storage_path IS NOT NULL and under final/
//   - evidence.revoked_at IS NULL
//   - can_access_incident_report(user, incident) = true
//   - rate-limit: 60/hour per user
// Any failure returns a uniform 403/404 so existence isn't leaked.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../../../../supabase/functions/_shared/auth.ts";
import { writeAudit } from "../../../../supabase/functions/_shared/audit.ts";
import { checkRateLimit, recordRateEvent } from "../_shared/rate-limit.ts";

const Body = z.object({
  evidence_id: z.string().uuid(),
  expires_in: z.number().int().min(30).max(120).optional(),
});

const json = (s: number, b: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: "bad_request" });
    const { evidence_id, expires_in } = parsed.data;

    const rl = await checkRateLimit(ctx.admin, "download", ctx.user.id, null);
    if (!rl.ok) return json(429, { error: "rate_limited" }, { "Retry-After": String(rl.retryAfterSeconds ?? 60) });

    const { data: ev } = await ctx.admin
      .from("incident_evidence")
      .select("id, incident_id, status, final_storage_path, revoked_at, mime_type")
      .eq("id", evidence_id)
      .maybeSingle();
    // Uniform failure — do not leak existence.
    if (!ev
        || ev.status !== "verified"
        || !ev.final_storage_path
        || !ev.final_storage_path.startsWith("final/")
        || ev.revoked_at) {
      return json(404, { error: "not_available" });
    }

    const { data: allowed, error: authzErr } = await ctx.admin.rpc(
      "can_access_incident_report",
      { _user_id: ctx.user.id, _incident_id: ev.incident_id },
    );
    if (authzErr || !allowed) return json(404, { error: "not_available" });

    const ttl = expires_in ?? 120;
    const { data: signed, error } = await (ctx.admin as any).storage
      .from("incident-evidence")
      .createSignedUrl(ev.final_storage_path, ttl);
    if (error) return json(500, { error: "signing_failed" });

    await recordRateEvent(ctx.admin, "download", ctx.user.id, null);

    // Audit every non-owner download.
    const isStaff = ctx.isSuperAdmin || ctx.roles.some((r) => ["admin"].includes(r));
    if (isStaff) {
      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: ctx.isSuperAdmin ? "super_admin" : "admin",
        action: "incident_evidence.download",
        target_type: "incident_evidence",
        target_id: ev.id,
        metadata: { incident_id: ev.incident_id, mime: ev.mime_type },
      });
    }

    return json(200, { url: signed.signedUrl, expires_in: ttl });
  } catch {
    return json(500, { error: "internal_error" });
  }
});
