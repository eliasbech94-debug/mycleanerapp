// Safe customer summary + search. Support/admin only.
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

    const u = new URL(req.url);
    const userId = u.searchParams.get("user_id");
    if (userId) {
      const { data, error } = await ctx.admin.rpc("support_customer_summary", { _user_id: userId });
      if (error) return json(500, { error: error.message }, corsHeaders);
      return json(200, { customer: data }, corsHeaders);
    }
    // Search
    const q = u.searchParams.get("q");
    const limit = Math.min(Number(u.searchParams.get("limit") ?? 50), 200);
    const { data, error } = await ctx.admin.rpc("support_search_users", { _q: q, _limit: limit });
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { customers: data ?? [] }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
