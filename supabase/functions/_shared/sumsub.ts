// Sumsub server helpers — Deno only.
// Never imported from client code. All HTTP calls are signed with HMAC-SHA256
// per Sumsub docs. Feature-flag gated by callers.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { signSumsubRequest, verifySumsubWebhookSignature } from "./sumsub-signing.ts";
import { toAlpha3 } from "./iso3.ts";

export interface SumsubConfig {
  appToken: string;
  secretKey: string;
  webhookSecret: string;
  baseUrl: string;
  providerLevel: string;
  customerLevel: string;
}

export function loadSumsubConfig(): SumsubConfig | null {
  const cfg = {
    appToken: Deno.env.get("SUMSUB_APP_TOKEN"),
    secretKey: Deno.env.get("SUMSUB_SECRET_KEY"),
    webhookSecret: Deno.env.get("SUMSUB_WEBHOOK_SECRET"),
    baseUrl: Deno.env.get("SUMSUB_BASE_URL") ?? "https://api.sumsub.com",
    providerLevel: Deno.env.get("SUMSUB_PROVIDER_LEVEL"),
    customerLevel: Deno.env.get("SUMSUB_CUSTOMER_LEVEL"),
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.warn("sumsub_config_incomplete", { missing });
    return null;
  }
  return cfg as SumsubConfig;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export type IdentityLevel = "customer" | "provider";
export type IdentityStatus =
  | "unverified"
  | "pending"
  | "approved"
  | "rejected"
  | "on_hold"
  | "expired";

/** Call a Sumsub API endpoint. Signs HMAC and returns parsed JSON. */
async function sumsubCall(
  cfg: SumsubConfig,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const bodyStr = body === undefined ? "" : JSON.stringify(body);
  const headers = await signSumsubRequest({
    appToken: cfg.appToken,
    secretKey: cfg.secretKey,
    method,
    path,
    body: bodyStr,
  });
  const res = await fetch(cfg.baseUrl + path, {
    method,
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
    body: bodyStr || undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (!res.ok) {
    throw new Error(`sumsub_${res.status}: ${text.slice(0, 500)}`);
  }
  return parsed;
}

export async function createApplicant(
  cfg: SumsubConfig,
  args: { externalUserId: string; level: IdentityLevel; countryCode?: string | null },
): Promise<{ id: string }> {
  const levelName = args.level === "provider" ? cfg.providerLevel : cfg.customerLevel;
  const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;
  const body: Record<string, unknown> = { externalUserId: args.externalUserId };
  // Sumsub requires ISO 3166-1 alpha-3; MyCleaner stores alpha-2 everywhere.
  // An unmappable code is omitted rather than sent through, because a bad
  // country value makes Sumsub reject the whole applicant with a 400.
  const alpha3 = toAlpha3(args.countryCode);
  if (alpha3) body.info = { country: alpha3 };
  else if (args.countryCode) {
    console.warn("sumsub_country_unmappable", { code: args.countryCode });
  }
  const r = await sumsubCall(cfg, "POST", path, body) as { id: string };
  return { id: r.id };
}

export async function issueAccessToken(
  cfg: SumsubConfig,
  args: { externalUserId: string; level: IdentityLevel; ttlSeconds?: number },
): Promise<{ token: string; userId: string; expiresAt: string }> {
  const levelName = args.level === "provider" ? cfg.providerLevel : cfg.customerLevel;
  const ttl = Math.min(Math.max(args.ttlSeconds ?? 600, 60), 3600);
  const path =
    `/resources/accessTokens?userId=${encodeURIComponent(args.externalUserId)}` +
    `&levelName=${encodeURIComponent(levelName)}` +
    `&ttlInSecs=${ttl}`;
  const r = await sumsubCall(cfg, "POST", path) as { token: string; userId: string };
  return {
    token: r.token,
    userId: r.userId,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

export async function getApplicantStatus(
  cfg: SumsubConfig,
  externalRef: string,
): Promise<{
  status: IdentityStatus;
  reviewAnswer: string | null;
  reviewSummary: Record<string, unknown>;
}> {
  const path = `/resources/applicants/${encodeURIComponent(externalRef)}/status`;
  const r = await sumsubCall(cfg, "GET", path) as {
    reviewStatus?: string;
    reviewResult?: { reviewAnswer?: string; rejectLabels?: string[]; reviewRejectType?: string };
  };
  return {
    status: mapSumsubStatus(
      r.reviewStatus,
      r.reviewResult?.reviewAnswer,
      r.reviewResult?.reviewRejectType,
    ),
    reviewAnswer: r.reviewResult?.reviewAnswer ?? null,
    reviewSummary: {
      reviewStatus: r.reviewStatus ?? null,
      reviewAnswer: r.reviewResult?.reviewAnswer ?? null,
      rejectLabels: r.reviewResult?.rejectLabels ?? [],
      reviewRejectType: r.reviewResult?.reviewRejectType ?? null,
    },
  };
}

export async function requestReverification(
  cfg: SumsubConfig,
  externalRef: string,
): Promise<void> {
  const path = `/resources/applicants/${encodeURIComponent(externalRef)}/resetStep`;
  // Sumsub requires ?stepName; we reset IDENTITY as a safe default.
  await sumsubCall(cfg, "POST", `${path}?stepName=IDENTITY`);
}

/**
 * Map Sumsub review states to our internal IdentityStatus enum.
 *
 * `reviewRejectType` is load-bearing and must not be dropped: Sumsub uses a RED
 * answer for two very different outcomes.
 *   - RED + RETRY  -> the applicant may (and must) resubmit better documents.
 *                     Mapping this to "rejected" would strand a recoverable
 *                     provider in a terminal-looking state, so it maps to
 *                     "pending" and the reject type is kept in metadata.
 *   - RED + FINAL  -> terminal rejection.
 * An absent reject type on a RED answer is treated as terminal (fail closed:
 * never resurrect an applicant we cannot prove is retryable).
 */
export function mapSumsubStatus(
  reviewStatus: string | undefined,
  reviewAnswer: string | undefined,
  reviewRejectType?: string | undefined,
): IdentityStatus {
  const s = (reviewStatus ?? "").toLowerCase();
  const a = (reviewAnswer ?? "").toUpperCase();
  const rt = (reviewRejectType ?? "").toUpperCase();
  if (s === "init" || s === "prechecked" || s === "queued" || s === "onhold") {
    return s === "onhold" ? "on_hold" : "pending";
  }
  if (s === "pending") return "pending";
  if (s === "completed") {
    if (a === "GREEN") return "approved";
    if (a === "RED") return rt === "RETRY" ? "pending" : "rejected";
  }
  return "pending";
}

/** SHA-256 of raw body as hex. Used for idempotency + audit. */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const data = typeof input === "string" ? enc.encode(input) : input;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compose a stable event id when the webhook payload lacks one. */
export function composeEventId(payload: {
  applicantId?: string;
  type?: string;
  createdAt?: string;
  correlationId?: string;
}, payloadHash: string): string {
  if (payload.correlationId) return `corr:${payload.correlationId}`;
  const parts = [payload.applicantId ?? "noapp", payload.type ?? "notype", payload.createdAt ?? ""];
  if (parts.every((p) => p)) return parts.join(":");
  return `hash:${payloadHash}`;
}

/**
 * Freshness guard for Sumsub webhooks (Sumsub sends `createdAtMs`).
 *
 * The window is deliberately asymmetric:
 *   - Past events get a generous 48h budget. Sumsub retries failed deliveries
 *     with exponential backoff over hours or days, so a tight past-window
 *     silently discards *legitimate* approval events — the delivery is rejected
 *     with 400, Sumsub eventually gives up, and the provider is stuck forever.
 *     Replay *attacks* are already defeated by the HMAC signature plus the
 *     UNIQUE(provider, event_id) idempotency key, which is where that
 *     responsibility belongs.
 *   - Future events get only 10 minutes, since a timestamp ahead of our clock
 *     is never a retry — it is clock skew or a forged payload.
 */
export const WEBHOOK_MAX_PAST_MS = 48 * 60 * 60_000;
export const WEBHOOK_MAX_FUTURE_MS = 10 * 60_000;

export function isReplay(
  createdAtMs: number | undefined,
  nowMs = Date.now(),
  maxPastMs = WEBHOOK_MAX_PAST_MS,
  maxFutureMs = WEBHOOK_MAX_FUTURE_MS,
): boolean {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return false; // if missing, defer to idempotency check
  const delta = nowMs - createdAtMs;
  if (delta >= 0) return delta > maxPastMs;
  return -delta > maxFutureMs;
}

/**
 * Ensure the caller has an identity row + link. Creates a placeholder identity
 * if the user has none yet (backfill covers existing users). Idempotent.
 */
export async function ensureIdentityForUser(
  admin: SupabaseClient,
  userId: string,
  level: IdentityLevel,
  countryCode: string | null,
): Promise<{ identityId: string; externalRef: string | null }> {
  const { data: link } = await admin
    .from("identity_account_links")
    .select("identity_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (link?.identity_id) {
    const { data: ident } = await admin
      .from("person_identities")
      .select("id, external_ref, level, country_code")
      .eq("id", link.identity_id)
      .maybeSingle();
    if (ident) {
      // Backfill level/country if missing
      const patch: Record<string, unknown> = {};
      if (!ident.level) patch.level = level;
      if (!ident.country_code && countryCode) patch.country_code = countryCode.toUpperCase();
      if (Object.keys(patch).length) {
        await admin.from("person_identities").update(patch).eq("id", ident.id);
      }
      return { identityId: ident.id, externalRef: ident.external_ref };
    }
  }

  const { data: created, error } = await admin
    .from("person_identities")
    .insert({
      status: "unverified",
      level,
      country_code: countryCode?.toUpperCase() ?? null,
    })
    .select("id, external_ref")
    .single();
  if (error) throw new Error(error.message);
  await admin.from("identity_account_links").insert({
    identity_id: created.id,
    user_id: userId,
    link_reason: "signup",
  });
  return { identityId: created.id, externalRef: created.external_ref };
}

/**
 * Rate limit token issuance: max N requests per identity per window.
 * Uses identity_verification_attempts as the ledger — cheap and audit-friendly.
 */
export async function isRateLimited(
  admin: SupabaseClient,
  identityId: string,
  maxPerWindow = 5,
  windowMinutes = 10,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count } = await admin
    .from("identity_verification_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identity_id", identityId)
    .gte("started_at", since);
  return (count ?? 0) >= maxPerWindow;
}

export async function isFlagOn(admin: SupabaseClient, key: string): Promise<boolean> {
  const { data } = await admin.rpc("evaluate_feature_flag", {
    _flag_key: key,
    _user_id: null,
    _provider_id: null,
    _country_iso: null,
  });
  return data === true;
}

export { verifySumsubWebhookSignature };
