// Public endpoint. Consumes a single-use email verification token.
//
// - Token is hashed (SHA-256) and compared against the stored hash.
// - Single-use enforced via `email_verification_used_at` and idempotently
//   returns success if the application is already verified.
// - Time-limited via `email_verification_expires_at`.
// - Emits `email_verified` event.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  campaignsEnabled,
  corsHeaders,
  emitEvent,
  json,
  sha256,
} from "../_shared/campaign.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!(await campaignsEnabled(admin))) return json(503, { error: "campaigns_disabled" });

  let application_id: string | undefined;
  let token: string | undefined;
  if (req.method === "GET") {
    const u = new URL(req.url);
    application_id = u.searchParams.get("aid") ?? undefined;
    token = u.searchParams.get("token") ?? undefined;
  } else {
    try {
      const body = await req.json();
      application_id = body.application_id;
      token = body.token;
    } catch {
      return json(400, { error: "invalid_json" });
    }
  }

  if (!application_id || !token || typeof token !== "string" || token.length > 256) {
    return json(400, { error: "invalid_request" });
  }

  const tokenHash = await sha256(token);

  const { data: app, error } = await admin
    .from("campaign_applications")
    .select(
      "id, campaign_id, country_code, email_verification_token, email_verification_expires_at, email_verification_used_at, email_verified_at, deleted_at, status",
    )
    .eq("id", application_id)
    .maybeSingle();

  if (error) return json(500, { error: "lookup_failed" });
  if (!app || app.deleted_at) return json(404, { error: "application_not_found" });

  // Idempotency: already verified — return ok.
  if (app.email_verified_at) {
    return json(200, {
      status: "already_verified",
      application: { id: app.id, status: app.status },
    });
  }

  if (!app.email_verification_token || app.email_verification_token !== tokenHash) {
    return json(400, { error: "invalid_token" });
  }
  if (
    app.email_verification_expires_at &&
    new Date(app.email_verification_expires_at).getTime() < Date.now()
  ) {
    return json(410, { error: "token_expired" });
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("campaign_applications")
    .update({
      email_verified_at: nowIso,
      email_verification_used_at: nowIso,
      email_verification_token: null, // burn the token
      email_verification_expires_at: null,
    })
    .eq("id", app.id)
    .is("email_verified_at", null); // guard against concurrent verify

  if (updErr) return json(500, { error: "verify_failed" });

  await emitEvent(admin, req, {
    campaign_id: app.campaign_id,
    application_id: app.id,
    event_type: "email_verified",
    country_code: app.country_code,
  });

  return json(200, { status: "verified", application: { id: app.id } });
});
