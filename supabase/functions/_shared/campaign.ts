// Shared Campaign Engine helpers. Reused across:
//   campaign-apply, campaign-verify-email, campaign-admin-action,
//   campaign-track-event, campaign-export-csv
//
// Everything here is edge-side. RLS + DB triggers remain the source of truth.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// -------------------- CORS --------------------
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// -------------------- Fingerprint --------------------
export function fp(req: Request) {
  const h = req.headers;
  const ip =
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const ua = h.get("user-agent") ?? null;
  return { ip, ua };
}

// -------------------- Hash --------------------
export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -------------------- Turnstile --------------------
/** Verifies a Cloudflare Turnstile token. Returns true on success. */
export async function verifyTurnstile(
  token: string | undefined | null,
  req: Request,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return { ok: false, reason: "turnstile_not_configured" };
  if (!token || typeof token !== "string") return { ok: false, reason: "missing_token" };
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = fp(req).ip;
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await r.json();
    if (!data?.success) return { ok: false, reason: "captcha_failed" };
    return { ok: true };
  } catch (_e) {
    return { ok: false, reason: "captcha_upstream_error" };
  }
}

// -------------------- Feature flag --------------------
/**
 * Returns true when `campaigns.enabled` is globally on. Public endpoints
 * short-circuit with 503 when this returns false. Admin endpoints ignore
 * the flag so operators can prepare content while the launch is gated.
 */
export async function campaignsEnabled(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("flag_key", "campaigns.enabled")
    .eq("scope", "global")
    .maybeSingle();
  return !!data?.enabled;
}

// -------------------- Rate limiting --------------------
export type ApplyOutcome = "accepted" | "rejected" | "duplicate" | "rate_limited";

export interface RateLimits {
  perIpWindowMs: number;
  perIpMax: number;
  perEmailWindowMs: number;
  perEmailMax: number;
}

export const APPLY_LIMITS: RateLimits = {
  perIpWindowMs: 10 * 60_000,
  perIpMax: 5,
  perEmailWindowMs: 24 * 60 * 60_000,
  perEmailMax: 3,
};

export async function checkApplyRateLimit(
  admin: SupabaseClient,
  campaignId: string,
  ip: string | null,
  email: string | null,
  limits: RateLimits = APPLY_LIMITS,
): Promise<{ ok: boolean; reason?: string; retry_after_sec?: number }> {
  const now = Date.now();
  if (ip) {
    const since = new Date(now - limits.perIpWindowMs).toISOString();
    const { count } = await admin
      .from("campaign_apply_attempts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= limits.perIpMax) {
      return { ok: false, reason: "rate_limited_ip", retry_after_sec: Math.ceil(limits.perIpWindowMs / 1000) };
    }
  }
  if (email) {
    const since = new Date(now - limits.perEmailWindowMs).toISOString();
    const { count } = await admin
      .from("campaign_apply_attempts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("email", email.toLowerCase())
      .gte("created_at", since);
    if ((count ?? 0) >= limits.perEmailMax) {
      return { ok: false, reason: "rate_limited_email", retry_after_sec: Math.ceil(limits.perEmailWindowMs / 1000) };
    }
  }
  return { ok: true };
}

export async function recordAttempt(
  admin: SupabaseClient,
  campaignId: string | null,
  ip: string | null,
  email: string | null,
  outcome: ApplyOutcome,
  reason?: string,
) {
  try {
    await admin.from("campaign_apply_attempts").insert({
      campaign_id: campaignId,
      ip,
      email: email ? email.toLowerCase() : null,
      outcome,
      reason: reason ?? null,
    });
  } catch (e) {
    console.error("apply_attempt_insert_failed", (e as Error).message);
  }
}

// -------------------- Event emit --------------------
/**
 * Server-side event emission. Callers pass the type explicitly; public
 * endpoints (campaign-track-event) additionally enforce a strict allowlist.
 */
export async function emitEvent(
  admin: SupabaseClient,
  req: Request | null,
  input: {
    campaign_id: string;
    event_type: string;
    application_id?: string | null;
    user_id?: string | null;
    country_code?: string | null;
    payload?: Record<string, unknown>;
    session_id?: string | null;
  },
) {
  const { ip, ua } = req ? fp(req) : { ip: null, ua: null };
  try {
    await admin.from("campaign_events").insert({
      campaign_id: input.campaign_id,
      application_id: input.application_id ?? null,
      user_id: input.user_id ?? null,
      event_type: input.event_type,
      country_code: input.country_code ?? null,
      payload: input.payload ?? {},
      session_id: input.session_id ?? null,
      ip,
      user_agent: ua,
    });
  } catch (e) {
    console.error("campaign_event_insert_failed", (e as Error).message, input.event_type);
  }
}

// -------------------- CSV safety --------------------
/**
 * Escapes a cell for CSV. Additionally neutralises spreadsheet formula
 * injection by prefixing dangerous leading characters with a single quote.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Neutralise formula injection (=, +, -, @, tab, CR)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// -------------------- Public event allowlist --------------------
export const PUBLIC_EVENT_TYPES = new Set<string>([
  "landing_viewed",
  "cta_clicked",
  "application_started",
]);

export const MAX_EVENT_PAYLOAD_BYTES = 2048;
