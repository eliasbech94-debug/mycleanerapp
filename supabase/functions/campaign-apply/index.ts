// Public endpoint. Receives a campaign application.
//
// M3 SECURITY CORRECTION:
// - Returns a generic response ONLY. Never reveals whether an application
//   was newly created, was a duplicate, or matched an existing email.
// - Never returns the raw verification token or verification URL.
// - Never logs the raw token; only its SHA-256 hash is persisted.
// - Raw token exists transiently on `campaign_email_outbox.payload` while
//   the delivery worker composes the message; the worker MUST clear it.
// - All classification (pending / waiting_list) is done server-side via the
//   `campaign_application_classify` trigger.
//
// Rate-limit durability: see docs/product/CAMPAIGN_RATE_LIMITING.md. All
// counters live in `public.campaign_apply_attempts`, which is shared across
// every edge-function instance and survives cold starts.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  APPLY_LIMITS,
  campaignsEnabled,
  checkApplyRateLimit,
  corsHeaders,
  emitEvent,
  fp,
  json,
  recordAttempt,
  verifyTurnstile,
} from "../_shared/campaign.ts";

// Generic response used for every non-validation outcome. Never varies by
// whether the email exists, is duplicate, is rate-limited by email, etc.
const GENERIC_OK = {
  ok: true,
  message: "If the application can be processed, verification instructions will be sent.",
};

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
  locale?: string | null;
}

function bad(status: number, code: string, extra: Record<string, unknown> = {}) {
  return json(status, { error: code, ...extra });
}

/**
 * Enqueue a verification email with ROUTING METADATA ONLY.
 * The delivery worker mints a fresh single-use token immediately before
 * sending and persists only its SHA-256 hash on campaign_applications.
 * The raw token never appears in this row, in logs, or in any admin surface.
 */
async function enqueueVerificationEmail(
  admin: ReturnType<typeof createClient>,
  args: {
    campaignId: string;
    applicationId: string;
    email: string;
    countryCode: string;
    locale: string | null;
  },
) {
  // dedupe_key rotates hourly so lost mails can be re-requested without
  // spamming, while still collapsing accidental double-submits inside a
  // single hour window.
  const window = Math.floor(Date.now() / 3_600_000);
  await admin.from("campaign_email_outbox").insert({
    campaign_id: args.campaignId,
    application_id: args.applicationId,
    email: args.email,
    template: "verification",
    locale: args.locale,
    // Payload holds ONLY non-sensitive template variables. A CHECK
    // constraint on the table rejects any attempt to write a token here.
    payload: { country_code: args.countryCode },
    dedupe_key: `verification:${args.applicationId}:${window}`,
  });
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

  // ---- Validation (only truly malformed input returns a specific error;
  // everything else collapses into the generic response) ----
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
    return bad(400, "captcha_failed");
  }

  // ---- Resolve campaign (existence is not enumerable — we still return the
  // generic response even if the campaign is missing, so probing slugs
  // doesn't reveal internal state. 404 would leak whether a slug exists.) ----
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, lifecycle, starts_at, ends_at, deleted_at, enable_waiting_list")
    .eq("slug", slug)
    .maybeSingle();

  const clientIp = fp(req).ip;

  const acceptedLifecycles = new Set(["active", "pre_launch", "preview"]);
  const now = Date.now();
  const campaignAccepting =
    !!campaign &&
    !campaign.deleted_at &&
    acceptedLifecycles.has(campaign.lifecycle) &&
    !(campaign.starts_at && new Date(campaign.starts_at).getTime() > now) &&
    !(campaign.ends_at && new Date(campaign.ends_at).getTime() < now);

  if (!campaignAccepting) {
    await recordAttempt(admin, campaign?.id ?? null, clientIp, email, "rejected", "campaign_not_accepting");
    return json(202, GENERIC_OK);
  }

  // ---- Country enabled ----
  const { data: cs } = await admin
    .from("campaign_country_settings")
    .select("enabled")
    .eq("campaign_id", campaign!.id)
    .eq("country_code", country)
    .maybeSingle();
  if (!cs?.enabled) {
    await recordAttempt(admin, campaign!.id, clientIp, email, "rejected", "country_not_enabled");
    return json(202, GENERIC_OK);
  }

  // ---- Rate limit (per-IP returns 429 with retry hint; per-email collapses
  // into the generic response so an attacker cannot use rate-limit signals to
  // enumerate emails) ----
  const rl = await checkApplyRateLimit(admin, campaign!.id, clientIp, email, APPLY_LIMITS);
  if (!rl.ok) {
    await recordAttempt(admin, campaign!.id, clientIp, email, "rate_limited", rl.reason);
    if (rl.reason === "rate_limited_ip") {
      return bad(429, "rate_limited", { retry_after_sec: rl.retry_after_sec });
    }
    // Silent for per-email limit — do NOT reveal.
    return json(202, GENERIC_OK);
  }

  // ---- Idempotency: existing application for (campaign, email)? ----
  const { data: existing } = await admin
    .from("campaign_applications")
    .select("id, email_verified_at, deleted_at")
    .eq("campaign_id", campaign!.id)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    await recordAttempt(admin, campaign!.id, clientIp, email, "duplicate", "existing_application");
    // If not verified yet, quietly re-issue a fresh verification token so
    // the user isn't blocked by a lost first email. Existence still not
    // revealed to the caller.
    if (!existing.email_verified_at) {
      const rawToken = randomToken(32);
      const tokenHash = await sha256(rawToken);
      const expiresAt = new Date(now + VERIFICATION_TTL_MS).toISOString();
      const { error: updErr } = await admin
        .from("campaign_applications")
        .update({
          email_verification_token: tokenHash,
          email_verification_expires_at: expiresAt,
          email_verification_sent_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .is("email_verified_at", null);
      if (!updErr) {
        try {
          await enqueueVerificationEmail(admin, {
            campaignId: campaign!.id,
            applicationId: existing.id,
            email,
            rawToken,
            expiresAt,
          });
        } catch (e) {
          // Never log raw token; only surface error class.
          console.error("campaign_verification_enqueue_failed", (e as Error).message);
        }
      }
    }
    return json(202, GENERIC_OK);
  }

  // ---- Fresh application ----
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(now + VERIFICATION_TTL_MS).toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("campaign_applications")
    .insert({
      campaign_id: campaign!.id,
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
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    // Log a code, not the payload; the payload could contain the email.
    console.error("campaign_apply_insert_failed", insErr?.code ?? "unknown");
    await recordAttempt(admin, campaign!.id, clientIp, email, "rejected", insErr?.code ?? "insert_failed");
    return json(202, GENERIC_OK);
  }

  await recordAttempt(admin, campaign!.id, clientIp, email, "accepted");

  // Emit the standard analytics event — payload is intentionally minimal.
  // Never include the raw token, verification URL, or the email.
  await emitEvent(admin, req, {
    campaign_id: campaign!.id,
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

  try {
    await enqueueVerificationEmail(admin, {
      campaignId: campaign!.id,
      applicationId: inserted.id,
      email,
      rawToken,
      expiresAt,
    });
  } catch (e) {
    console.error("campaign_verification_enqueue_failed", (e as Error).message);
  }

  return json(202, GENERIC_OK);
});
