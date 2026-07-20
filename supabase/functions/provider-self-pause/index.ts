// POST /provider-self-pause — provider pauses their own active profile.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  try {
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
    const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.slice(0, 128) : null;

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data, error } = await userClient.rpc("admin_provider_action", {
      _target_user_id: ctx.user.id,
      _action: "self_pause",
      _reason: reason,
      _idempotency_key: idempotencyKey,
      _metadata: {},
    });
    if (error) {
      const code = (error.message ?? "pause_failed").split(":")[0].trim();
      return json({ error: code, message: error.message }, 400);
    }
    return json({ ok: true, result: data });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
