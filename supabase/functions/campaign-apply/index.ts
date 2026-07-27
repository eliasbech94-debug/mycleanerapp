// Public endpoint. Receives a campaign application, verifies Turnstile,
// enforces per-IP + per-email rate limiting, inserts the application (the
// `campaign_application_classify` trigger handles pending vs waiting_list),
// and dispatches a hashed single-use email verification token.
//
// Behaviour:
// - Feature-flag gated on `campaigns.enabled` (returns 503 when off).
// - Idempotent per (campaign, email): re-submitting the same email returns
//   the existing application status instead of creating a duplicate.
// - Raw token appears once in the response `verification_url`. Only its
//   SHA-256 hash is persisted.
//
// This function never trusts client-side status classification. The DB
// trigger owns pending / waiting_list / rejected transitions.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  APPLY_LIMITS,
  campaignsEnabled,
  checkApplyRateLimit,
  corsHeaders,
  emitEvent,
  fp,
  json,
  randomToken,
  recordAttempt,
  sha256,
  verifyTurnstile,
} from "../_shared/campaign.ts";

const VERIFICATION_TTL_MS = 24 * 60 * 60_000;

interface ApplyBody {
  campaign_slug?: string;
  country_code?: string;
  full_name?: string;
  company_name?: string | null;
  email?: string;
  phone?: string | null;
  city?: string | null;
  languages?: string[];
  categories?: string[];
  experience_years?: number | null;
  hourly_rate_minor?: number | null;
  postal_codes?: string[];
  referral_code?: string | null;
  invite_source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  heard_about?: string | null;
  accepted_terms?: boolean;
  accepted_privacy?: boolean;
  turnstile_token?: string;
  session_id?: string | null;
}

function bad(status: number, code: string, extra: Record<string, unknown> = {}) {
  return json(status, { error: code, ...extra });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!(await campaignsEnabled(admin))) return bad(503, "campaigns_disabled");

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  // ---- Validation ----
  const slug = (body.campaign_slug ?? "").trim().toLowerCase();
  const country = (body.country_code ?? "").trim().toUpperCase();
  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim();

  if (!slug || slug.length > 128) return bad(400, "invalid_campaign_slug");
  if (!/^[A-Z]{2}$/.test(country)) return bad(400, "invalid_country_code");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return bad(400, "invalid_email");
  }
  if (fullName.length < 2 || fullName.length > 200) return bad(400, "invalid_full_name");
  if (!body.accepted_terms || !body.accepted_privacy) return bad(400, "consent_required");

  const languages = Array.isArray(body.languages) ? body.languages.slice(0, 20) : [];
  const categories = Array.isArray(body.categories) ? body.categories.slice(0, 20) : [];
  const postalCodes = Array.isArray(body.postal_codes) ? body.postal_codes.slice(0, 200) : [];

  // ---- Turnstile ----
  const cap = await verifyTurnstile(body.turnstile_token, req);
  if (!cap.ok) {
    await recordAttempt(admin, null, fp(req).ip, email, "rejected", cap.reason);
    return bad(400, "captcha_failed", { reason: cap.reason });
  }

  // ---- Resolve campaign ----
  const { data: campaign, error: campErr } = await admin
    .from("campaigns")
    .select("id, lifecycle, starts_at, ends_at, deleted_at, enable_waiting_list")
    .eq("slug", slug)
    .maybeSingle();
  if (campErr) return bad(500, "campaign_lookup_failed");
  if (!campaign || campaign.deleted_at) return bad(404, "campaign_not_found");

  const acceptedLifecycles = new Set(["active", "pre_launch", "preview"]);
  if (!acceptedLifecycles.has(campaign.lifecycle)) return bad(409, "campaign_not_accepting");

  const now = Date.now();
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) {
    return bad(409, "campaign_not_started");
  }
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < now) {
    return bad(409, "campaign_ended");
  }

  // ---- Country enabled ----
  const { data: cs } = await admin
    .from("campaign_country_settings")
    .select("enabled")
    .eq("campaign_id", campaign.id)
    .eq("country_code", country)
    .maybeSingle();
  if (!cs?.enabled) return bad(409, "country_not_enabled");

  const clientIp = fp(req).ip;

  // ---- Rate limit ----
  const rl = await checkApplyRateLimit(admin, campaign.id, clientIp, email, APPLY_LIMITS);
  if (!rl.ok) {
    await recordAttempt(admin, campaign.id, clientIp, email, "rate_limited", rl.reason);
    return bad(429, rl.reason ?? "rate_limited", { retry_after_sec: rl.retry_after_sec });
  }

  // ---- Idempotency: existing application for (campaign, email)? ----
  const { data: existing } = await admin
    .from("campaign_applications")
    .select("id, status, email_verified_at, assigned_number, waiting_list_position")
    .eq("campaign_id", campaign.id)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    await recordAttempt(admin, campaign.id, clientIp, email, "duplicate", "existing_application");
    return json(200, {
      status: "duplicate",
      application: {
        id: existing.id,
        status: existing.status,
        email_verified: !!existing.email_verified_at,
        assigned_number: existing.assigned_number,
        waiting_list_position: existing.waiting_list_position,
      },
    });
  }

  // ---- Generate verification token ----
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(now + VERIFICATION_TTL_MS).toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("campaign_applications")
    .insert({
      campaign_id: campaign.id,
      country_code: country,
      full_name: fullName,
      company_name: body.company_name?.trim() || null,
      email,
      phone: body.phone?.trim() || null,
      city: body.city?.trim() || null,
      languages,
      categories,
      experience_years: body.experience_years ?? null,
      hourly_rate_minor: body.hourly_rate_minor ?? null,
      postal_codes: postalCodes,
      referral_code: body.referral_code?.trim() || null,
      invite_source: body.invite_source?.trim() || null,
      utm_source: body.utm_source?.trim() || null,
      utm_medium: body.utm_medium?.trim() || null,
      utm_campaign: body.utm_campaign?.trim() || null,
      heard_about: body.heard_about?.trim() || null,
      accepted_terms_at: new Date().toISOString(),
      accepted_privacy_at: new Date().toISOString(),
      email_verification_token: tokenHash,
      email_verification_expires_at: expiresAt,
      email_verification_sent_at: new Date().toISOString(),
      ip: clientIp,
      user_agent: fp(req).ua,
      // status is set by classify trigger
    })
    .select("id, status, waiting_list_position, assigned_number")
    .single();

  if (insErr || !inserted) {
    console.error("campaign_apply_insert_failed", insErr);
    await recordAttempt(admin, campaign.id, clientIp, email, "rejected", insErr?.message);
    return bad(500, "insert_failed");
  }

  await recordAttempt(admin, campaign.id, clientIp, email, "accepted");
  await emitEvent(admin, req, {
    campaign_id: campaign.id,
    application_id: inserted.id,
    event_type: "application_submitted",
    country_code: country,
    session_id: body.session_id ?? null,
    payload: {
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
    },
  });

  const publicBase = Deno.env.get("PUBLIC_APP_URL") ?? "";
  const verificationUrl = publicBase
    ? `${publicBase.replace(/\/$/, "")}/campaigns/verify?token=${rawToken}&aid=${inserted.id}`
    : null;

  // Delivery is stubbed for M2 — the raw URL is logged and returned to the
  // caller so the frontend (Milestone 3) or a follow-up email worker can send
  // it. TODO(M3): enqueue via notification_outbox once the campaigns email
  // template is scaffolded.
  console.log(
    "campaign_verification_email_pending",
    JSON.stringify({ application_id: inserted.id, email, verificationUrl }),
  );

  return json(201, {
    status: "created",
    application: {
      id: inserted.id,
      status: inserted.status,
      waiting_list_position: inserted.waiting_list_position,
      assigned_number: inserted.assigned_number,
    },
    verification: {
      required: true,
      expires_at: expiresAt,
      // The raw URL is returned so the frontend or delivery worker can send
      // it; the server never stores the raw token.
      url: verificationUrl,
    },
  });
});
