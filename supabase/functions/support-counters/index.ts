// Support sidebar badge counters. Support/admin only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { json } from "../_shared/conversations.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const forbidden = requireRole(ctx, ["support", "admin"] as any, corsHeaders);
    if (forbidden) return forbidden;

    const { data, error } = await ctx.admin.rpc("support_counters", { _user: ctx.user.id });
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { counters: data ?? {} }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
