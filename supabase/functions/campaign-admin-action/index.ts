// Admin-only endpoint for the Campaign Engine.
//
// Actions:
// - approve                     Approve an application. Idempotent. Creates a
//                               Supabase auth user for the applicant (via
//                               admin.inviteUserByEmail) if none exists yet,
//                               links it via `provider_user_id`, and grants
//                               all `campaign_rewards` rows configured for
//                               the campaign+country.
// - reject                      Reject an application. Idempotent.
// - resend_verification_email   Rotate the verification token and expiry.
// - soft_delete                 Sets deleted_at / deleted_by.
// - restore                     Clears deleted_at.
// - get_upload_url              Returns a short-lived signed download URL
//                               for a file under `campaign-uploads/`.
//
// Idempotency: repeated approve/reject with the same `idempotency_key`
// (header `Idempotency-Key` or body field) short-circuit to the current
// state without creating duplicate auth users, reward grants, or audit
// entries. The DB unique index on (campaign_id, provider_user_id) also
// prevents double linking.

import {
  authenticate,
  requireRole,
} from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { corsHeaders, emitEvent, json, randomToken, sha256 } from "../_shared/campaign.ts";

interface Body {
  action?: string;
  application_id?: string;
  reason?: string;
  storage_path?: string;
  ttl_sec?: number;
  idempotency_key?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin", "support"], corsHeaders);
  if (forbidden) return forbidden;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const action = body.action;
  const applicationId = body.application_id;
  const idempotencyKey =
    body.idempotency_key ?? req.headers.get("idempotency-key") ?? null;

  if (!action) return json(400, { error: "missing_action" });

  const admin = ctx.admin;
  const actorRole = ctx.roles[0] ?? "admin";

  // ---- get_upload_url handled up-front (no application update) ----
  if (action === "get_upload_url") {
    if (!body.storage_path || typeof body.storage_path !== "string") {
      return json(400, { error: "missing_storage_path" });
    }
    if (!body.storage_path.startsWith("applications/") && !body.storage_path.startsWith("campaigns/")) {
      return json(400, { error: "invalid_storage_path" });
    }
    const ttl = Math.min(Math.max(body.ttl_sec ?? 300, 30), 3600);
    const { data, error } = await admin.storage
      .from("campaign-uploads")
      .createSignedUrl(body.storage_path, ttl);
    if (error) return json(404, { error: "file_not_found", detail: error.message });
    await writeAudit(admin, req, {
      actor_user_id: ctx.user.id,
      actor_role: actorRole,
      action: "campaign.file_signed_url_issued",
      target_type: "campaign_upload",
      target_id: body.storage_path,
      metadata: { ttl_sec: ttl },
    });
    return json(200, { url: data.signedUrl, expires_in: ttl });
  }

  if (!applicationId) return json(400, { error: "missing_application_id" });

  const { data: app, error: appErr } = await admin
    .from("campaign_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) return json(500, { error: "lookup_failed" });
  if (!app) return json(404, { error: "application_not_found" });

  // ---- Idempotency short-circuit ----
  if (idempotencyKey && app.approval_idempotency_key === idempotencyKey) {
    return json(200, {
      status: "idempotent_replay",
      application: { id: app.id, status: app.status },
    });
  }

  switch (action) {
    case "approve": {
      if (app.status === "approved") {
        return json(200, {
          status: "already_approved",
          application: { id: app.id, provider_user_id: app.provider_user_id },
        });
      }
      // Create or link auth user
      let providerUserId = app.provider_user_id as string | null;
      if (!providerUserId) {
        // Look up existing user by email
        const { data: existingUsers } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1,
          // deno-lint-ignore no-explicit-any
        } as any);
        const found = existingUsers?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === String(app.email).toLowerCase(),
        );
        if (found) {
          providerUserId = found.id;
        } else {
          const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(
            String(app.email),
            {
              data: {
                campaign_application_id: app.id,
                campaign_id: app.campaign_id,
                full_name: app.full_name,
              },
            },
          );
          if (invErr || !invited?.user) {
            return json(500, { error: "user_create_failed", detail: invErr?.message });
          }
          providerUserId = invited.user.id;
        }
      }

      const { error: updErr } = await admin
        .from("campaign_applications")
        .update({
          status: "approved",
          reviewed_by: ctx.user.id,
          reviewed_at: new Date().toISOString(),
          provider_user_id: providerUserId,
          user_id: app.user_id ?? providerUserId,
          approval_idempotency_key: idempotencyKey,
        })
        .eq("id", app.id)
        .neq("status", "approved");
      if (updErr) return json(500, { error: "approve_failed", detail: updErr.message });

      // Grant rewards for campaign+country (idempotent via unique on application_id+reward_id).
      const { data: rewards } = await admin
        .from("campaign_rewards")
        .select("id, reward_type, value_minor, currency, duration_days")
        .eq("campaign_id", app.campaign_id)
        .eq("enabled", true)
        .or(`country_code.is.null,country_code.eq.${app.country_code}`);

      for (const r of rewards ?? []) {
        const expiresAt = r.duration_days
          ? new Date(Date.now() + r.duration_days * 86_400_000).toISOString()
          : null;
        const { error: grantErr } = await admin
          .from("campaign_reward_grants")
          .insert({
            campaign_id: app.campaign_id,
            application_id: app.id,
            user_id: providerUserId,
            reward_id: r.id,
            expires_at: expiresAt,
            status: "active",
            metadata: {},
          });
        if (grantErr && !String(grantErr.message).includes("duplicate")) {
          console.error("reward_grant_failed", grantErr.message);
        }
      }

      await emitEvent(admin, req, {
        campaign_id: app.campaign_id,
        application_id: app.id,
        user_id: providerUserId,
        event_type: "application_approved",
        country_code: app.country_code,
      });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: actorRole,
        action: "campaign.application.approved",
        target_type: "campaign_application",
        target_id: app.id,
        previous_state: { status: app.status },
        new_state: { status: "approved", provider_user_id: providerUserId },
      });
      return json(200, {
        status: "approved",
        application: { id: app.id, provider_user_id: providerUserId },
      });
    }

    case "reject": {
      if (app.status === "rejected") {
        return json(200, { status: "already_rejected" });
      }
      const reason = (body.reason ?? "").slice(0, 500) || null;
      const { error: updErr } = await admin
        .from("campaign_applications")
        .update({
          status: "rejected",
          reviewed_by: ctx.user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
          approval_idempotency_key: idempotencyKey,
        })
        .eq("id", app.id)
        .neq("status", "rejected");
      if (updErr) return json(500, { error: "reject_failed" });

      await emitEvent(admin, req, {
        campaign_id: app.campaign_id,
        application_id: app.id,
        event_type: "application_rejected",
        country_code: app.country_code,
        payload: { reason },
      });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: actorRole,
        action: "campaign.application.rejected",
        target_type: "campaign_application",
        target_id: app.id,
        previous_state: { status: app.status },
        new_state: { status: "rejected", rejection_reason: reason },
      });
      return json(200, { status: "rejected" });
    }

    case "resend_verification_email": {
      if (app.email_verified_at) return json(200, { status: "already_verified" });
      const raw = randomToken(32);
      const tokenHash = await sha256(raw);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const { error: updErr } = await admin
        .from("campaign_applications")
        .update({
          email_verification_token: tokenHash,
          email_verification_expires_at: expiresAt,
          email_verification_sent_at: new Date().toISOString(),
          email_verification_used_at: null,
        })
        .eq("id", app.id);
      if (updErr) return json(500, { error: "resend_failed" });
      const publicBase = Deno.env.get("PUBLIC_APP_URL") ?? "";
      const url = publicBase
        ? `${publicBase.replace(/\/$/, "")}/campaigns/verify?token=${raw}&aid=${app.id}`
        : null;
      console.log(
        "campaign_verification_email_resent",
        JSON.stringify({ application_id: app.id, email: app.email, url }),
      );
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: actorRole,
        action: "campaign.verification_email_resent",
        target_type: "campaign_application",
        target_id: app.id,
      });
      return json(200, { status: "sent", expires_at: expiresAt, url });
    }

    case "soft_delete": {
      if (app.deleted_at) return json(200, { status: "already_deleted" });
      const { error: updErr } = await admin
        .from("campaign_applications")
        .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.user.id })
        .eq("id", app.id);
      if (updErr) return json(500, { error: "delete_failed" });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: actorRole,
        action: "campaign.application.soft_deleted",
        target_type: "campaign_application",
        target_id: app.id,
      });
      return json(200, { status: "deleted" });
    }

    case "restore": {
      if (!app.deleted_at) return json(200, { status: "not_deleted" });
      const { error: updErr } = await admin
        .from("campaign_applications")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", app.id);
      if (updErr) return json(500, { error: "restore_failed" });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: actorRole,
        action: "campaign.application.restored",
        target_type: "campaign_application",
        target_id: app.id,
      });
      return json(200, { status: "restored" });
    }

    default:
      return json(400, { error: "unknown_action", action });
  }
});
