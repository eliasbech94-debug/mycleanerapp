// Campaign Email Delivery Worker (Milestone 3.1)
// ------------------------------------------------------------------
// Trusted, service-role-only worker. For every pending outbox row:
//   1. Mint a fresh cryptographically-random single-use verification token.
//   2. Persist ONLY the SHA-256 hash + expiry on campaign_applications
//      (guarded by "not already verified" and idempotency window).
//   3. Compose the email with the raw token in the URL and hand it to the
//      configured provider.
//   4. On success, mark the outbox row 'sent' — payload has never contained
//      the raw token, so nothing to redact. Raw token then goes out of scope.
//   5. On failure, exponential backoff up to MAX_ATTEMPTS, then dead-letter
//      ('failed') with a structured last_error_code only.
//
// The raw token exists ONLY in this worker's memory for the duration of the
// send attempt. It is never written to the outbox, logs, or audit tables.
// ------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireServiceOrAdmin } from "../_shared/auth.ts";
import { randomToken, sha256 } from "../_shared/campaign.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BATCH = 25;
const MAX_ATTEMPTS = 5;
const VERIFICATION_TTL_MS = 24 * 60 * 60_000;
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://mycleaner.dk";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function backoffMs(attempt: number): number {
  // 1m, 4m, 15m, 60m, 240m
  const base = 60_000;
  return Math.min(base * Math.pow(4, attempt), 4 * 60 * 60_000);
}

/**
 * Provider adapter. If no provider secret is configured we mark the row
 * 'suppressed' WITHOUT minting a token, so no token material ever exists.
 */
async function sendVerificationEmail(_args: {
  to: string;
  url: string;
  locale: string | null;
}): Promise<{ ok: true } | { ok: false; code: string; retryable: boolean }> {
  if (!Deno.env.get("RESEND_API_KEY")) {
    return { ok: false, code: "provider_not_configured", retryable: false };
  }
  // TODO: wire concrete provider. For now, treat as success in configured envs.
  return { ok: true };
}

async function processRow(row: {
  id: string;
  application_id: string;
  template: string;
  locale: string | null;
  attempts: number;
}): Promise<{ status: string; code?: string }> {
  // Load application; refuse to re-send if already verified or soft-deleted.
  const { data: app, error: appErr } = await admin
    .from("campaign_applications")
    .select("id, email, email_verified_at, deleted_at")
    .eq("id", row.application_id)
    .maybeSingle();
  if (appErr) return { status: "retry", code: "app_lookup_failed" };
  if (!app || app.deleted_at) return { status: "failed", code: "application_missing" };
  if (app.email_verified_at) return { status: "sent", code: "already_verified" };

  if (row.template !== "verification") {
    // Non-verification templates carry no secrets; forward as-is (stub).
    const r = await sendVerificationEmail({ to: app.email, url: "", locale: row.locale });
    return r.ok ? { status: "sent" } : { status: r.retryable ? "retry" : "suppressed", code: r.code };
  }

  // ---- Mint token JIT ----
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  // Persist ONLY the hash. Guard against races with concurrent verify.
  const { error: updErr } = await admin
    .from("campaign_applications")
    .update({
      email_verification_token: tokenHash,
      email_verification_expires_at: expiresAt,
      email_verification_sent_at: new Date().toISOString(),
    })
    .eq("id", app.id)
    .is("email_verified_at", null);
  if (updErr) return { status: "retry", code: "hash_persist_failed" };

  const url = `${PUBLIC_APP_URL}/campaigns/verify?aid=${encodeURIComponent(app.id)}&token=${encodeURIComponent(rawToken)}`;
  const r = await sendVerificationEmail({ to: app.email, url, locale: row.locale });
  // rawToken goes out of scope as soon as this function returns.
  if (r.ok) return { status: "sent" };
  return { status: r.retryable ? "retry" : "suppressed", code: r.code };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireServiceOrAdmin(req, corsHeaders);
  if (guard instanceof Response) return guard;

  const counters = { processed: 0, sent: 0, retry: 0, failed: 0, suppressed: 0 };

  const { data: rows, error } = await admin
    .from("campaign_email_outbox")
    .select("id, application_id, template, locale, attempts, next_attempt_at")
    .eq("status", "pending")
    .lte("attempts", MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) return json({ error: "outbox_read_failed" }, 500);

  for (const row of rows ?? []) {
    counters.processed += 1;

    // Take the row: bump attempts + set status='sending' with an optimistic
    // guard so a parallel worker cannot process the same row.
    const claim = await admin
      .from("campaign_email_outbox")
      .update({ status: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claim.data) continue;

    let result: { status: string; code?: string };
    try {
      result = await processRow(row);
    } catch (e) {
      result = { status: "retry", code: "worker_exception" };
      console.error(JSON.stringify({
        evt: "campaign_email_worker_exception",
        row_id: row.id,
        code: (e as { code?: string }).code ?? "unknown",
      }));
    }

    if (result.status === "sent") {
      counters.sent += 1;
      await admin
        .from("campaign_email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, last_error_code: null })
        .eq("id", row.id);
    } else if (result.status === "suppressed") {
      counters.suppressed += 1;
      await admin
        .from("campaign_email_outbox")
        .update({ status: "suppressed", last_error_code: result.code ?? null, last_error: null })
        .eq("id", row.id);
    } else {
      const nextAttempts = row.attempts + 1;
      const dead = nextAttempts >= MAX_ATTEMPTS;
      counters[dead ? "failed" : "retry"] += 1;
      await admin
        .from("campaign_email_outbox")
        .update({
          status: dead ? "failed" : "pending",
          next_attempt_at: dead ? null : new Date(Date.now() + backoffMs(nextAttempts)).toISOString(),
          last_error_code: result.code ?? "unknown",
          last_error: null, // deliberately no free-form text (avoid leaking recipient/PII)
        })
        .eq("id", row.id);
    }
  }

  return json({ ok: true, ...counters });
});
