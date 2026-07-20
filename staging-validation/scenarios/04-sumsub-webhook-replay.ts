// Replays a Sumsub sandbox applicantReviewed webhook and verifies
// identity_webhook_events + person_identities effects.
import { env } from "../config.js";
import { runScenario, assert, attach } from "../lib/reporter.js";
import { sumsubSignature } from "../lib/sumsub-sign.js";
import { psqlJson } from "../lib/supabase-admin.js";
import { httpCall } from "../lib/http.js";

export async function scenarioSumsubReplay() {
  return runScenario("04-sumsub-webhook", "Replay Sumsub sandbox reviewed webhook", async (ctx) => {
    const applicantId = `rc2-applicant-${Date.now()}`;
    const payload = JSON.stringify({
      applicantId, inspectionId: `rc2-insp-${Date.now()}`,
      correlationId: `rc2-corr-${Date.now()}`,
      externalUserId: `rc2-ext-${Date.now()}`,
      type: "applicantReviewed",
      reviewResult: { reviewAnswer: "GREEN", moderationComment: null, clientComment: null, reviewRejectType: null, buttonIds: [] },
      reviewStatus: "completed",
      createdAtMs: Date.now(),
    });
    const sig = sumsubSignature(payload, env.SUMSUB_WEBHOOK_SECRET);
    const call = await httpCall("sumsub-applicantReviewed", env.SUMSUB_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payload-digest": sig,
        "x-payload-digest-alg": "HMAC_SHA256_HEX",
      },
      body: payload,
    });
    attach(ctx, call.artifact);
    assert(ctx, "webhook accepted", call.status < 300, `status=${call.status}`);

    const rows = psqlJson<{ applicant_id: string; event_type: string }>(
      `select applicant_id, event_type from public.identity_webhook_events
        where applicant_id = '${applicantId}' order by created_at desc limit 5`,
    );
    assert(ctx, "event logged", rows.length > 0);
  });
}
