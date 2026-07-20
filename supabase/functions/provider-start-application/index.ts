// POST /provider-start-application — thin wrapper around start_provider_application()
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { reconcileProvider } from "../_shared/providerReconcile.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  try {
    // SECURITY DEFINER function uses auth.uid() — must invoke through user client.
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data, error } = await userClient.rpc("start_provider_application");
    if (error) {
      console.error("start_provider_application failed", error);
      return json({ error: "start_failed", code: error.code ?? null, message: error.message }, 400);
    }
    await reconcileProvider(ctx.admin, ctx.user.id, "application_started");
    return json({ ok: true, profile: data });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
