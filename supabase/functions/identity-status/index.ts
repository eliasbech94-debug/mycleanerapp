// GET/POST /identity-status
// Returns the caller's identity status. Optional `?refresh=1` pulls latest
// from Sumsub and updates the local row (still not authoritative — only
// webhooks flip status to `approved`/`rejected`).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { isFlagOn, loadSumsubConfig, getApplicantStatus, requestReverification } from "../_shared/sumsub.ts";
import { writeAudit } from "../_shared/audit.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const { admin, user } = ctx;

    const url = new URL(req.url);
    const wantRefresh = url.searchParams.get("refresh") === "1";
    const wantReverify = req.method === "POST" && url.searchParams.get("reverify") === "1";

    const { data: link } = await admin
      .from("identity_account_links").select("identity_id")
      .eq("user_id", user.id).maybeSingle();
    if (!link) {
      return json({ status: "unverified", identityId: null, applicantId: null, level: null });
    }
    const { data: ident } = await admin
      .from("person_identities")
      .select("id, external_ref, status, level, country_code, verified_at, expires_at, last_review_at")
      .eq("id", link.identity_id).maybeSingle();
    if (!ident) return json({ status: "unverified" });

    if ((wantRefresh || wantReverify) && ident.external_ref) {
      if (!(await isFlagOn(admin, "identity.enabled"))) {
        return json({ error: "identity_disabled" }, 503);
      }
      const cfg = loadSumsubConfig();
      if (!cfg) return json({ error: "identity_provider_unconfigured" }, 503);

      if (wantReverify) {
        // Only allow reverification if not currently pending review.
        await requestReverification(cfg, ident.external_ref);
        await admin
          .from("person_identities")
          .update({ status: "pending", last_review_at: new Date().toISOString() })
          .eq("id", ident.id);
        await writeAudit(admin, req, {
          actor_user_id: user.id, action: "identity.reverification_requested",
          target_type: "person_identities", target_id: ident.id,
        });
      } else {
        const s = await getApplicantStatus(cfg, ident.external_ref);
        await admin
          .from("person_identities")
          .update({
            // Do not overwrite approved/rejected here — those flow from webhooks.
            status: (ident.status === "approved" || ident.status === "rejected") ? ident.status : s.status,
            last_review_at: new Date().toISOString(),
            metadata: s.reviewSummary,
          })
          .eq("id", ident.id);
      }
    }

    // Re-read after possible update
    const { data: finalIdent } = await admin
      .from("person_identities")
      .select("id, external_ref, status, level, country_code, verified_at, expires_at, last_review_at")
      .eq("id", link.identity_id).maybeSingle();

    return json({
      identityId: finalIdent!.id,
      applicantId: finalIdent!.external_ref,
      status: finalIdent!.status,
      level: finalIdent!.level,
      countryCode: finalIdent!.country_code,
      verifiedAt: finalIdent!.verified_at,
      expiresAt: finalIdent!.expires_at,
      lastReviewAt: finalIdent!.last_review_at,
    });
  } catch (e) {
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
