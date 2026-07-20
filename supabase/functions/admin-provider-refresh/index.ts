// POST /admin-provider-refresh — admin only.
// Thin wrapper around refresh_provider_score_tier() and reconcile_provider_status().
// No business logic; both RPCs are SECURITY DEFINER and enforce their own auth.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KINDS = new Set(["score", "reconcile"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.target_user_id ?? "");
    const kind = String(body?.kind ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return json({ error: "invalid_target_user_id" }, 400);
    if (!KINDS.has(kind)) return json({ error: "invalid_kind", allowed: [...KINDS] }, 400);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    let data: unknown; let error: { message: string } | null = null;
    if (kind === "score") {
      const r = await userClient.rpc("refresh_provider_score_tier", { _uid: targetUserId, _reason: "admin_manual" });
      data = r.data; error = r.error;
    } else {
      const r = await userClient.rpc("reconcile_provider_status", { _uid: targetUserId });
      data = r.data; error = r.error;
    }
    if (error) {
      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id, actor_role: "admin",
        action: `provider_refresh_failed:${kind}`, target_type: "provider_profile", target_id: targetUserId,
        metadata: { error: error.message },
      });
      const code = (error.message ?? "refresh_failed").split(":")[0].trim();
      return json({ error: code, message: error.message }, 400);
    }
    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id, actor_role: "admin",
      action: `provider_refresh:${kind}`, target_type: "provider_profile", target_id: targetUserId,
      new_state: (data ?? {}) as object,
    });
    return json({ ok: true, result: data });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
