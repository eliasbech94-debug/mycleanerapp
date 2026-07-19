// Safe booking summary + search. Support/admin only.
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
    const bookingId = u.searchParams.get("booking_id");
    if (bookingId) {
      const { data, error } = await ctx.admin.rpc("support_booking_summary", { _booking_id: bookingId });
      if (error) return json(500, { error: error.message }, corsHeaders);
      return json(200, { booking: data }, corsHeaders);
    }
    const q = u.searchParams.get("q");
    const limit = Math.min(Number(u.searchParams.get("limit") ?? 50), 200);
    const { data, error } = await ctx.admin.rpc("support_search_bookings", { _q: q, _limit: limit });
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { bookings: data ?? [] }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
