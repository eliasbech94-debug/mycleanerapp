// POST /provider-recompute — safe self-service reconciliation hook.
// Idempotent no-op if the caller has no provider_profiles row.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { reconcileProvider } from "../_shared/providerReconcile.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const { data: pp } = await ctx.admin.from("provider_profiles")
    .select("user_id").eq("user_id", ctx.user.id).maybeSingle();
  if (!pp) return json({ ok: true, skipped: true });

  await reconcileProvider(ctx.admin, ctx.user.id, "self_recompute");
  return json({ ok: true });
});
