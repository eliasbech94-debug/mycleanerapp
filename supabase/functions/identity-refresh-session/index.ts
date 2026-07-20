// POST /identity-refresh-session
// Returns a fresh WebSDK access token for the caller's existing identity.
// Same guards as create-session but never creates a new applicant.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import {
  isRateLimited, isFlagOn, loadSumsubConfig, issueAccessToken,
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

    const { data: link } = await admin
      .from("identity_account_links").select("identity_id")
      .eq("user_id", user.id).maybeSingle();
    if (!link) return json({ error: "no_identity" }, 404);

    const { data: ident } = await admin
      .from("person_identities")
      .select("id, external_ref, level")
      .eq("id", link.identity_id).maybeSingle();
    if (!ident?.external_ref) return json({ error: "no_applicant" }, 404);

    if (await isRateLimited(admin, ident.id)) {
      return json({ error: "rate_limited", retry_after_seconds: 600 }, 429);
    }

    const token = await issueAccessToken(cfg, {
      externalUserId: ident.id,
      level: (ident.level as "provider" | "customer") ?? "customer",
      ttlSeconds: 600,
    });

    await admin.from("identity_verification_attempts").insert({
      identity_id: ident.id, provider: "sumsub",
      provider_applicant_id: ident.external_ref,
      level: ident.level, status: "pending",
      review_summary: { action: "token_refreshed" },
    });
    await writeAudit(admin, req, {
      actor_user_id: user.id, action: "identity.session_refreshed",
      target_type: "person_identities", target_id: ident.id,
    });

    return json({ token: token.token, userId: token.userId, expiresAt: token.expiresAt });
  } catch (e) {
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
