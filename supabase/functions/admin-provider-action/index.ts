// POST /admin-provider-action — admin/super_admin only.
// Thin wrapper around admin_provider_action(). Enforces admin role at the edge
// in addition to the SECURITY DEFINER function's own guard. Idempotent.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Admin-only action set; `pause`/`unpause` are aliases for the RPC's
// self_pause/self_unpause branches which admins are explicitly allowed to invoke.
const ALLOWED_ACTIONS = new Set([
  "approve", "reject", "suspend", "unsuspend",
  "pause", "unpause",
  "archive", "restore",
  "set_partner", "unset_partner",
  "freeze_payout", "unfreeze_payout",
]);
const ACTION_ALIAS: Record<string, string> = { pause: "self_pause", unpause: "self_unpause" };

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
    const action = String(body?.action ?? "");
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
    const idempotencyKey = typeof body?.idempotency_key === "string"
      ? body.idempotency_key.slice(0, 128)
      : req.headers.get("Idempotency-Key");
    const metadata = (body?.metadata && typeof body.metadata === "object") ? body.metadata : {};

    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return json({ error: "invalid_target_user_id" }, 400);
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      return json({ error: "invalid_action", allowed: [...ALLOWED_ACTIONS] }, 400);
    }

    // Use user's JWT so admin_provider_action can read auth.uid() for actor.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const rpcAction = ACTION_ALIAS[action] ?? action;
    const { data, error } = await userClient.rpc("admin_provider_action", {
      _target_user_id: targetUserId,
      _action: rpcAction,
      _reason: reason,
      _idempotency_key: idempotencyKey,
      _metadata: metadata,
    });
    if (error) {
      const code = (error.message ?? "action_failed").split(":")[0].trim();
      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id, actor_role: "admin",
        action: `provider_action_failed:${action}`, target_type: "provider_profile", target_id: targetUserId,
        metadata: { error: error.message, code },
      });
      return json({ error: code, message: error.message }, 400);
    }

    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id, actor_role: "admin",
      action: `provider_${action}`, target_type: "provider_profile", target_id: targetUserId,
      new_state: data as object, metadata: { reason, idempotency_key: idempotencyKey },
    });

    return json({ ok: true, result: data });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
