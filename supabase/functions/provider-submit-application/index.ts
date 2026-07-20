// POST /provider-submit-application — thin wrapper around submit_provider_application()
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { reconcileProvider } from "../_shared/providerReconcile.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  try {
    // Reconcile first so submission sees the freshest completion/status.
    await reconcileProvider(ctx.admin, ctx.user.id, "pre_submit");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data, error } = await userClient.rpc("submit_provider_application");
    if (error) {
      // Backend raises structured messages like `requirements_incomplete: ...`
      const msg = error.message ?? "submit_failed";
      const code = msg.split(":")[0]?.trim() || "submit_failed";
      return json({ error: code, message: msg, details: error.details ?? null }, 400);
    }
    return json({ ok: true, profile: data });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
