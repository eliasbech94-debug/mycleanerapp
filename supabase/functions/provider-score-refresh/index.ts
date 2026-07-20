// POST /provider-score-refresh — admin only. Recomputes score+tier for a user.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.user_id ?? "");
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : "admin_manual";
    if (!/^[0-9a-f-]{36}$/i.test(uid)) return json({ error: "invalid_user_id" }, 400);

    const { error: cErr } = await ctx.admin.rpc("calc_provider_completion", { _uid: uid });
    if (cErr) return json({ error: "completion_failed", message: cErr.message }, 500);
    const { data, error } = await ctx.admin.rpc("refresh_provider_score_tier", { _uid: uid, _reason: reason });
    if (error) return json({ error: "score_refresh_failed", message: error.message }, 500);
    return json({ ok: true, result: data });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
