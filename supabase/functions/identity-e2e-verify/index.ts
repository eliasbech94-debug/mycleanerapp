// POST /identity-e2e-verify — admin-only, non-production-only live flow check.
//
// Proves the Sumsub half of provider/customer verification end to end against
// the real API, for BOTH configured levels:
//   applicant create -> WebSDK token issue -> forced sandbox GREEN -> status
//   read-back -> internal status mapping.
//
// Deliberately touches NO MyCleaner tables. It uses throwaway externalUserIds
// so it can be run against a live project without polluting person_identities,
// provider_profiles or the approval engine.
//
// Refuses to run when the environment resolves to production, so a sandbox
// forcing endpoint can never be reachable on a production configuration.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { signSumsubRequest } from "../_shared/sumsub-signing.ts";
import { resolveSumsubEnv, isSandboxResult } from "../_shared/sumsubEnv.ts";
import {
  loadSumsubConfig, createApplicant, issueAccessToken,
  getApplicantStatus, mapSumsubStatus, type IdentityLevel,
} from "../_shared/sumsub.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Sumsub sandbox-only: force a review verdict on a test applicant. */
async function forceSandboxVerdict(
  cfg: { appToken: string; secretKey: string; baseUrl: string },
  applicantId: string,
  reviewAnswer: "GREEN" | "RED",
): Promise<{ ok: boolean; status: number; note: string }> {
  const path = `/resources/applicants/${encodeURIComponent(applicantId)}/status/testCompleted`;
  const body = JSON.stringify({ reviewAnswer, rejectLabels: [] });
  const headers = await signSumsubRequest({
    appToken: cfg.appToken, secretKey: cfg.secretKey, method: "POST", path, body,
  });
  const res = await fetch(cfg.baseUrl + path, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, note: text.slice(0, 200) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const cfg = loadSumsubConfig();
  if (!cfg) return json({ error: "identity_provider_unconfigured" }, 503);

  const envDecision = resolveSumsubEnv(cfg.baseUrl, cfg.appToken);
  if (envDecision.isProduction) {
    return json({
      error: "refused_in_production",
      detail: "This diagnostic forces Sumsub verdicts and is disabled on production configuration.",
      environment: envDecision.environment,
    }, 403);
  }

  const steps: Record<string, unknown> = {};
  const levels: IdentityLevel[] = ["provider", "customer"];

  for (const level of levels) {
    const externalUserId = `e2e-${level}-${crypto.randomUUID()}`;
    const record: Record<string, unknown> = { external_user_id: externalUserId };
    try {
      // 1. Applicant creation — this is the step that failed for every real
      //    provider while the level names were wrong.
      const applicant = await createApplicant(cfg, { externalUserId, level, countryCode: "DK" });
      record.applicant_created = true;
      record.applicant_id = applicant.id;

      // 2. WebSDK access token — what the onboarding UI actually consumes.
      const token = await issueAccessToken(cfg, { externalUserId, level, ttlSeconds: 600 });
      record.access_token_issued = Boolean(token.token);
      record.token_expires_at = token.expiresAt;

      // 3. Force a GREEN verdict (sandbox only).
      const forced = await forceSandboxVerdict(cfg, applicant.id, "GREEN");
      record.forced_green = forced.ok;
      if (!forced.ok) record.force_note = forced.note;

      // 4. Read the verdict back through the same code path the reconcile job
      //    uses, and map it with the production mapper.
      let summary = await getApplicantStatus(cfg, applicant.id);
      for (let i = 0; i < 5 && summary.status !== "approved"; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        summary = await getApplicantStatus(cfg, applicant.id);
      }
      record.review_answer = summary.reviewAnswer;
      record.mapped_status = summary.status;
      record.approved = summary.status === "approved";

      // 5. Provenance: a sandbox verdict must be marked as such, because the
      //    database gate refuses sandbox identities while it considers itself
      //    production.
      record.treated_as_sandbox_result = isSandboxResult(true, envDecision);

      // 6. Confirm the RETRY branch is reachable from a real payload shape.
      record.retry_maps_to_pending =
        mapSumsubStatus("completed", "RED", "RETRY") === "pending";
    } catch (e) {
      record.error = (e as Error).message.slice(0, 300);
    }
    steps[level] = record;
  }

  const allOk = levels.every((l) => (steps[l] as Record<string, unknown>)?.approved === true);

  console.log(JSON.stringify({
    evt: "identity.e2e_verify", by: ctx.user.id,
    environment: envDecision.environment, all_ok: allOk,
  }));

  return json({
    checked_at: new Date().toISOString(),
    environment: envDecision.environment,
    levels_used: { provider: cfg.providerLevel, customer: cfg.customerLevel },
    steps,
    all_levels_verified: allOk,
  });
});
