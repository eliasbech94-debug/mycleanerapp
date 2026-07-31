// POST /admin-provider-action — admin/super_admin only.
// Thin wrapper around admin_provider_action(). Enforces admin role at the edge
// in addition to the SECURITY DEFINER function's own guard. Idempotent.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { notifyUser } from "../_shared/notify.ts";
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

// Actions that go against the provider and therefore require a provider-facing,
// appealable decision notice (MC-PROVIDER-AGREEMENT-001 §12/§14).
const NOTICE_TYPE: Record<string, string> = {
  suspend: "suspend",
  reject: "reject",
  archive: "archive",
  freeze_payout: "freeze_payout",
};
const WITHHOLD_CODES = new Set([
  "fraud_prevention", "other_user_safety", "legal_requirement", "ongoing_investigation",
]);
const WITHHELD_TEXT =
  "Vi kan ikke oplyse den fulde begrundelse for denne afgorelse. Du kan stadig klage, " +
  "og en medarbejder gennemgar din sag.";
const DEFAULT_REASON: Record<string, string> = {
  suspend: "Din profil er midlertidigt suspenderet efter en manuel gennemgang.",
  reject: "Din ansogning er ikke godkendt efter en manuel gennemgang.",
  archive: "Din profil er arkiveret efter en manuel gennemgang.",
  freeze_payout: "Dine udbetalinger er midlertidigt sat pa hold efter en manuel gennemgang.",
};
const NOTIFICATION_TITLE: Record<string, string> = {
  suspend: "Din profil er suspenderet",
  reject: "Din ansogning er afvist",
  archive: "Din profil er arkiveret",
  freeze_payout: "Dine udbetalinger er sat pa hold",
};

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

    // Negative decisions must always produce a provider-facing, appealable
    // notice. The provider can no longer read the raw internal action ledger,
    // so this notice is their only (and deliberately sanitised) view of the
    // decision. Every notice records that a human made the call.
    const noticeType = NOTICE_TYPE[action];
    if (noticeType) {
      const withheldCode = typeof body?.reason_withheld_code === "string"
        ? body.reason_withheld_code
        : null;
      const withheld = WITHHOLD_CODES.has(withheldCode ?? "");
      const providerReason = typeof body?.provider_reason === "string" && body.provider_reason.trim()
        ? body.provider_reason.trim().slice(0, 4000)
        : (withheld ? WITHHELD_TEXT : (reason ?? DEFAULT_REASON[noticeType]));

      const { data: notice, error: noticeErr } = await ctx.admin
        .from("provider_decision_notices")
        .insert({
          provider_user_id: targetUserId,
          admin_action_id: null,
          decision_type: noticeType,
          decision_status: (data as { status?: string } | null)?.status ?? null,
          provider_reason: providerReason,
          rules_applied: Array.isArray(body?.rules_applied)
            ? body.rules_applied.filter((r: unknown) => typeof r === "string").slice(0, 20)
            : [],
          reason_withheld: withheld,
          reason_withheld_code: withheld ? withheldCode : null,
          human_reviewed: true,
          ai_assisted: body?.ai_assisted === true,
          appealable: true,
          issued_by: ctx.user.id,
        })
        .select("id")
        .maybeSingle();

      if (noticeErr) {
        // A decision without a notice would strip the provider of their appeal
        // right, so surface it loudly instead of failing silently.
        await writeAudit(ctx.admin, req, {
          actor_user_id: ctx.user.id, actor_role: "admin",
          action: "provider_decision_notice_failed", target_type: "provider_profile", target_id: targetUserId,
          metadata: { error: noticeErr.message, decision_type: noticeType },
        });
      } else if (notice) {
        await notifyUser(ctx.admin, {
          user_id: targetUserId,
          event_type: `provider.${noticeType}`,
          dedupe_key: `provider_decision:${notice.id}`,
          subject: NOTIFICATION_TITLE[noticeType],
          body: withheld ? WITHHELD_TEXT : providerReason.slice(0, 240),
          vars: { reason: withheld ? WITHHELD_TEXT : providerReason.slice(0, 240) },

          action_label: "Se afgorelsen",
          action_url: `/provider/decisions/${notice.id}`,
          severity: "warning",
          channels: ["in_app", "email"],
        }).catch(() => {});
      }
    }

    return json({ ok: true, result: data });

  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
