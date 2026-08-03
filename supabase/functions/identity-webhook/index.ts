// POST /identity-webhook — Sumsub → MyCleaner
// Signature: HMAC-SHA256(webhookSecret, rawBody) in `x-payload-digest`.
// Idempotent: identity_webhook_events UNIQUE(provider, event_id).
// Freshness-guarded: 48h past / 10min future window on `createdAtMs`; replay
// safety itself comes from the HMAC signature + UNIQUE(provider, event_id).
// Never trusts client claims — only this handler flips status to approved/rejected.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  serviceClient, loadSumsubConfig, verifySumsubWebhookSignature,
  sha256Hex, composeEventId, isReplay, isFlagOn, mapSumsubStatus,
} from "../_shared/sumsub.ts";
import { isSandboxResult, resolveSumsubEnv } from "../_shared/sumsubEnv.ts";
import { evaluateProviderApproval, notifyApprovalRegression } from "../_shared/providerApproval.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface SumsubWebhook {
  applicantId?: string;
  inspectionId?: string;
  correlationId?: string;
  externalUserId?: string;      // = person_identities.id (we set this at applicant creation)
  type?: string;                 // e.g. applicantReviewed, applicantPending, applicantOnHold
  reviewStatus?: string;
  reviewResult?: { reviewAnswer?: string; rejectLabels?: string[]; reviewRejectType?: string };
  createdAtMs?: number;
  sandboxMode?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = serviceClient();
  const cfg = loadSumsubConfig();
  const rawBody = await req.text();
  const payloadHash = await sha256Hex(rawBody);

  // Parse header case-insensitively.
  const headerDigest =
    req.headers.get("x-payload-digest") ??
    req.headers.get("X-Payload-Digest") ??
    req.headers.get("X-PAYLOAD-DIGEST") ??
    undefined;

  // Insert audit row first (received). We'll upsert result at the end.
  let parsed: SumsubWebhook = {};
  try { parsed = JSON.parse(rawBody); } catch { /* keep empty */ }
  const eventId = composeEventId(parsed, payloadHash);

  // 1) Signature check
  if (!cfg) {
    await admin.from("identity_webhook_events").upsert({
      provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
      payload_hash: payloadHash, signature_ok: false, result: "failed",
      error: "provider_unconfigured",
      received_at: new Date().toISOString(),
    }, { onConflict: "provider,event_id" });
    return json({ error: "identity_provider_unconfigured" }, 503);
  }

  const sigOk = await verifySumsubWebhookSignature({
    webhookSecret: cfg.webhookSecret, rawBody, headerDigest,
  });
  if (!sigOk) {
    await admin.from("identity_webhook_events").upsert({
      provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
      payload_hash: payloadHash, signature_ok: false, result: "signature_invalid",
      received_at: new Date().toISOString(),
    }, { onConflict: "provider,event_id" });
    return json({ error: "invalid_signature" }, 401);
  }

  // 2) Replay protection
  if (isReplay(parsed.createdAtMs)) {
    await admin.from("identity_webhook_events").upsert({
      provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
      payload_hash: payloadHash, signature_ok: true, result: "failed",
      error: "replay_out_of_window",
      received_at: new Date().toISOString(),
    }, { onConflict: "provider,event_id" });
    return json({ error: "replay" }, 400);
  }

  // 3) Idempotency: if we already processed this event_id, ack fast.
  const { data: existing } = await admin
    .from("identity_webhook_events")
    .select("id, result")
    .eq("provider", "sumsub").eq("event_id", eventId).maybeSingle();
  // Do NOT rewrite the row to "duplicate": that erases the only record that
  // this event was processed, so a third delivery would read "duplicate",
  // fall through, and re-apply the state change. Keep "processed" sticky and
  // treat a pre-existing "duplicate" (written by the earlier buggy path) as
  // processed too, so already-corrupted rows cannot be reprocessed either.
  if (existing && (existing.result === "processed" || existing.result === "duplicate")) {
    console.log(JSON.stringify({
      evt: "identity.webhook_duplicate", event_id: eventId, event_type: parsed.type ?? null,
    }));
    return json({ ok: true, duplicate: true });
  }

  // 4) Feature-flag gate for actual state changes
  if (!(await isFlagOn(admin, "identity.webhook_processing"))) {
    await admin.from("identity_webhook_events").upsert({
      provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
      payload_hash: payloadHash, signature_ok: true, result: "received",
      error: "processing_disabled_by_flag",
      received_at: new Date().toISOString(),
    }, { onConflict: "provider,event_id" });
    return json({ ok: true, deferred: true });
  }

  // 5) Resolve identity by externalUserId (preferred) or applicantId.
  try {
    let identityId: string | null = null;
    if (parsed.externalUserId) {
      const { data } = await admin.from("person_identities")
        .select("id").eq("id", parsed.externalUserId).maybeSingle();
      if (data) identityId = data.id;
    }
    if (!identityId && parsed.applicantId) {
      const { data } = await admin.from("person_identities")
        .select("id").eq("external_ref", parsed.applicantId).maybeSingle();
      if (data) identityId = data.id;
    }
    if (!identityId) {
      await admin.from("identity_webhook_events").upsert({
        provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
        payload_hash: payloadHash, signature_ok: true, result: "unknown_type",
        error: "identity_not_found",
        received_at: new Date().toISOString(),
      }, { onConflict: "provider,event_id" });
      return json({ ok: true, unmatched: true });
    }

    const status = mapSumsubStatus(
      parsed.reviewStatus,
      parsed.reviewResult?.reviewAnswer,
      parsed.reviewResult?.reviewRejectType,
    );
    const envDecision = resolveSumsubEnv(cfg.baseUrl, cfg.appToken);
    const sandbox = isSandboxResult(parsed.sandboxMode ?? null, envDecision);
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status, last_review_at: nowIso,
      metadata: {
        reviewStatus: parsed.reviewStatus ?? null,
        reviewAnswer: parsed.reviewResult?.reviewAnswer ?? null,
        rejectLabels: parsed.reviewResult?.rejectLabels ?? [],
        reviewRejectType: parsed.reviewResult?.reviewRejectType ?? null,
        sandboxMode: parsed.sandboxMode ?? null,
      },
    };
    if (status === "approved") patch.verified_at = nowIso;

    await admin.from("person_identities").update(patch).eq("id", identityId);

    await admin.from("identity_verification_attempts").insert({
      identity_id: identityId, provider: "sumsub",
      provider_applicant_id: parsed.applicantId ?? null,
      level: null, status,
      review_summary: patch.metadata as object,
      closed_at: (status === "approved" || status === "rejected") ? nowIso : null,
    });

    // Explicit reconciliation for every linked provider (defensive; the
    // person_identities trigger also fans out, but webhooks must call the
    // trusted triple per Step 3a contract). Sumsub approval never activates.
    try {
      const { reconcileProvider } = await import("../_shared/providerReconcile.ts");
      const { data: links } = await admin.from("identity_account_links")
        .select("user_id").eq("identity_id", identityId);
      for (const link of links ?? []) {
        const { data: pp } = await admin.from("provider_profiles")
          .select("user_id").eq("user_id", link.user_id).maybeSingle();
        if (pp) {
          // Persist the Sumsub verdict + sandbox provenance, then let the
          // central engine decide. Sandbox results can never approve in prod.
          await admin.rpc("apply_provider_identity_sync", {
            _uid: link.user_id,
            _status: status,
            _sandbox: sandbox,
            _applicant_id: parsed.applicantId ?? null,
          });
        }
        await reconcileProvider(admin, link.user_id, "identity_webhook");
        if (pp) {
          const approval = await evaluateProviderApproval(admin, link.user_id, "identity_webhook");
          if (approval) await notifyApprovalRegression(admin, link.user_id, approval);
        }
      }
    } catch (e) { console.error("identity reconcile fanout failed", (e as Error).message); }

    console.log(JSON.stringify({
      evt: "identity.webhook_processed",
      event_id: eventId,
      applicant_id: parsed.applicantId ?? null,
      event_type: parsed.type ?? null,
      review_status: parsed.reviewStatus ?? null,
      review_answer: parsed.reviewResult?.reviewAnswer ?? null,
      sandbox,
      environment: envDecision.environment,
      status,
      at: nowIso,
    }));

    await admin.from("identity_webhook_events").upsert({
      provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
      payload_hash: payloadHash, signature_ok: true, result: "processed",
      received_at: nowIso, processed_at: nowIso,
    }, { onConflict: "provider,event_id" });

    return json({ ok: true, status });
  } catch (e) {
    await admin.from("identity_webhook_events").upsert({
      provider: "sumsub", event_id: eventId, event_type: parsed.type ?? null,
      payload_hash: payloadHash, signature_ok: true, result: "failed",
      error: (e as Error).message,
      received_at: new Date().toISOString(),
    }, { onConflict: "provider,event_id" });
    return json({ error: "internal_error" }, 500);
  }
});
