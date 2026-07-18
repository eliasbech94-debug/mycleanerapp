// Receives redacted client-side error/perf events and stores in error_events.
// Public but rate-limited via IP + user id; body is capped and scrubbed again server-side.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { correlationId, scrubForLog } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const corr = correlationId(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": corr },
  });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  if (raw.length > 32_000) return json({ error: "payload_too_large" }, 413);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }

  // Best-effort user identity (JWT is optional for public error capture)
  let userId: string | null = null;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    try {
      const { data } = await admin.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    } catch { /* anon errors still allowed */ }
  }

  const fp = {
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    ua: req.headers.get("user-agent") ?? null,
  };

  const row = {
    source: "frontend" as const,
    level: (["debug","info","warning","error","fatal"].includes(body?.level) ? body.level : "error"),
    environment: String(body?.environment ?? "production").slice(0, 64),
    release: body?.release ? String(body.release).slice(0, 128) : null,
    route: body?.route ? String(body.route).slice(0, 512) : null,
    message: String(body?.message ?? "Unknown error").slice(0, 2000),
    error_category: body?.category ? String(body.category).slice(0, 128) : null,
    stack: body?.stack ? String(body.stack).slice(0, 8000) : null,
    correlation_id: body?.correlation_id ? String(body.correlation_id).slice(0, 128) : corr,
    user_id: userId,
    metadata: scrubForLog(body?.metadata ?? {}),
    ip_address: fp.ip,
    user_agent: fp.ua,
    status_code: typeof body?.status_code === "number" ? body.status_code : null,
    duration_ms: typeof body?.duration_ms === "number" ? Math.round(body.duration_ms) : null,
  };

  await admin.from("error_events").insert(row);
  return json({ ok: true, correlation_id: corr });
});
