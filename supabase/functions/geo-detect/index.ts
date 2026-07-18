// Geo-detect (HINT ONLY). Reads Cloudflare / edge geo headers. Never persists
// the result, never overrides an explicit URL / manual / saved preference on
// the client. Rate-limited per IP (in-memory best-effort — this is a hint
// endpoint; a burst is not a security problem). Never returns the raw IP.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { monitored } from "../_shared/logger.ts";

const SUPPORTED = new Set(["DK", "GB", "SE", "ES"]);
const FALLBACK = "GB";

// Best-effort in-memory rate limit (Deno isolate scope).
const bucket = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX = 30;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const cur = bucket.get(key);
  if (!cur || cur.reset < now) {
    bucket.set(key, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (cur.n >= MAX) return false;
  cur.n++;
  return true;
}

// SHA-256 hash the IP so we never store or expose it, but can still bucket.
async function hashIp(ip: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + ":geo"));
  return Array.from(new Uint8Array(b)).slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(monitored("geo-detect", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0";
  const key = await hashIp(ip);
  if (!rateLimit(key)) {
    // Fail open — never break routing. Just don't reveal a fresh hint.
    return json({ iso: FALLBACK, source: "rate_limited", supported: false });
  }

  // Cloudflare-style header on Supabase edge. Fallback to Accept-Language.
  const cfCountry = (req.headers.get("cf-ipcountry") ?? "").toUpperCase();
  let iso = cfCountry;
  let source = "geoip";
  if (!iso || iso === "XX" || iso === "T1") {
    const lang = (req.headers.get("accept-language") ?? "").slice(0, 5).toUpperCase();
    // en-GB, sv-SE, es-ES, da-DK
    const m = lang.match(/-([A-Z]{2})/);
    iso = m?.[1] ?? "";
    source = "accept-language";
  }
  const supported = SUPPORTED.has(iso);
  return json({ iso: supported ? iso : FALLBACK, source, supported });
}));

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=300",
    },
  });
}
