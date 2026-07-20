// POST /identity-create-session
// Body: { level?: "provider" | "customer" }
// Returns: { token, userId, expiresAt, applicantId, status }
//
// - Requires authenticated user (JWT).
// - Feature flag `identity.enabled` must be ON, otherwise 503.
// - Rate limited: 5 attempts / 10 min per identity.
// - Creates Sumsub applicant if the user has none, links external_ref.
// - Never marks the user verified; only issues a short-lived WebSDK token.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  ensureIdentityForUser,
  isRateLimited,
  isFlagOn,
  loadSumsubConfig,
  createApplicant,
  issueAccessToken,
  type IdentityLevel,
} from "../_shared/sumsub.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const { admin, user } = ctx;

    if (!(await isFlagOn(admin, "identity.enabled"))) {
      return json({ error: "identity_disabled" }, 503);
    }

    const cfg = loadSumsubConfig();
    if (!cfg) return json({ error: "identity_provider_unconfigured" }, 503);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const level: IdentityLevel =
      (body?.level === "provider" || body?.level === "customer") ? body.level : "customer";

    // Load profile for country + provider_id inference
    const { data: profile } = await admin
      .from("profiles")
      .select("country_code, provider_id")
      .eq("id", user.id)
      .maybeSingle();

    const effectiveLevel: IdentityLevel = profile?.provider_id ? "provider" : level;

    const ident = await ensureIdentityForUser(
      admin, user.id, effectiveLevel, profile?.country_code ?? null,
    );

    if (await isRateLimited(admin, ident.identityId)) {
      return json({ error: "rate_limited", retry_after_seconds: 600 }, 429);
    }

    // Create Sumsub applicant if missing
    let externalRef = ident.externalRef;
    if (!externalRef) {
      const applicant = await createApplicant(cfg, {
        externalUserId: ident.identityId,           // stable, non-PII
        level: effectiveLevel,
        countryCode: profile?.country_code ?? null,
      });
      externalRef = applicant.id;
      await admin
        .from("person_identities")
        .update({ external_ref: externalRef, status: "pending" })
        .eq("id", ident.identityId);
    }

    const token = await issueAccessToken(cfg, {
      externalUserId: ident.identityId,
      level: effectiveLevel,
      ttlSeconds: 600,
    });

    // Log attempt (also used for rate limiting)
    await admin.from("identity_verification_attempts").insert({
      identity_id: ident.identityId,
      provider: "sumsub",
      provider_applicant_id: externalRef,
      level: effectiveLevel,
      status: "pending",
      review_summary: { action: "token_issued" },
    });

    await writeAudit(admin, req, {
      actor_user_id: user.id,
      action: "identity.session_created",
      target_type: "person_identities",
      target_id: ident.identityId,
      metadata: { level: effectiveLevel, applicant_id: externalRef },
    });

    return json({
      token: token.token,
      userId: token.userId,
      expiresAt: token.expiresAt,
      applicantId: externalRef,
      level: effectiveLevel,
    });
  } catch (e) {
    console.error("identity-create-session error", (e as Error).message);
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
