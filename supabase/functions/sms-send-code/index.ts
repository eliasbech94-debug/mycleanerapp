import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { monitored } from "../_shared/logger.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Abuse-protection tuning (additive, DB-only, no schema change) ---
// All windows/caps are conservative; can be relaxed later.
const LIMITS = {
  perUserShort: { max: 3, windowMs: 10 * 60_000 },   // 3 codes / 10 min per user (existing)
  perUserDaily: { max: 10, windowMs: 24 * 60 * 60_000 }, // 10 codes / 24h per user
  perPhoneHour: { max: 5, windowMs: 60 * 60_000 },   // 5 codes / hour per E.164 phone (across ALL users)
  perPhoneDaily: { max: 15, windowMs: 24 * 60 * 60_000 }, // 15 codes / 24h per phone
};

function normalize(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });
}

function tooMany(retryAfterSec: number, msg: string) {
  return json({ error: msg, retry_after: retryAfterSec }, 429, {
    "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))),
  });
}

Deno.serve(monitored("sms-send-code", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const phone = normalize(String(body?.phone ?? ""));
    if (!phone) return json({ error: "Ugyldigt telefonnummer" }, 400);

    const now = Date.now();

    // ---- Per-user short window (existing behaviour, preserved) ----
    {
      const since = new Date(now - LIMITS.perUserShort.windowMs).toISOString();
      const { count } = await supabase
        .from("sms_verifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since);
      if ((count ?? 0) >= LIMITS.perUserShort.max) {
        return tooMany(
          LIMITS.perUserShort.windowMs / 1000,
          "For mange forsøg. Prøv igen om 10 minutter.",
        );
      }
    }

    // ---- Per-user daily cap ----
    {
      const since = new Date(now - LIMITS.perUserDaily.windowMs).toISOString();
      const { count } = await supabase
        .from("sms_verifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since);
      if ((count ?? 0) >= LIMITS.perUserDaily.max) {
        return tooMany(
          LIMITS.perUserDaily.windowMs / 1000,
          "Daglig grænse nået. Prøv igen i morgen.",
        );
      }
    }

    // ---- Per-phone hourly cap (blocks bombing one phone across accounts) ----
    {
      const since = new Date(now - LIMITS.perPhoneHour.windowMs).toISOString();
      const { count } = await supabase
        .from("sms_verifications")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone)
        .gte("created_at", since);
      if ((count ?? 0) >= LIMITS.perPhoneHour.max) {
        return tooMany(
          LIMITS.perPhoneHour.windowMs / 1000,
          "Dette telefonnummer har modtaget for mange koder. Prøv igen om en time.",
        );
      }
    }

    // ---- Per-phone daily cap ----
    {
      const since = new Date(now - LIMITS.perPhoneDaily.windowMs).toISOString();
      const { count } = await supabase
        .from("sms_verifications")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone)
        .gte("created_at", since);
      if ((count ?? 0) >= LIMITS.perPhoneDaily.max) {
        return tooMany(
          LIMITS.perPhoneDaily.windowMs / 1000,
          "Daglig grænse for dette telefonnummer nået.",
        );
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(`${phone}:${code}`);
    const expires_at = new Date(now + 10 * 60_000).toISOString();

    const { error: insErr } = await supabase.from("sms_verifications").insert({
      user_id: userId,
      phone,
      code_hash,
      expires_at,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // Structured audit log (no PII in message body). Kept for prod observability.
    console.log(JSON.stringify({
      evt: "sms.code.issued",
      user_id: userId,
      phone_hash: (await sha256(phone)).slice(0, 12),
      at: new Date(now).toISOString(),
    }));

    // TODO: integrate SMS provider (Twilio) here.
    // dev_code is ONLY returned when SMS_DEV_MODE=true is explicitly set.
    // In production this env var MUST be unset so codes never leak to the client.
    const devMode = (Deno.env.get("SMS_DEV_MODE") ?? "").toLowerCase() === "true";
    if (devMode) {
      console.log(`[sms-send-code:dev] user=${userId} phone=${phone} code=${code}`);
      return json({ ok: true, phone, dev_code: code });
    }
    return json({ ok: true, phone });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}));
