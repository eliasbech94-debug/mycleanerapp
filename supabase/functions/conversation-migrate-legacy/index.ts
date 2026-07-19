// Admin-only trigger for the idempotent legacy support migration RPC.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { isAdmin, json } from "../_shared/conversations.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isAdmin(ctx)) return json(403, { error: "admin_only" }, corsHeaders);
    const { data, error } = await ctx.admin.rpc("migrate_legacy_support_threads");
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { result: data }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
