// Read-only list of refund requests for a conversation. Support/admin only.
// Support never sees admin decision internals beyond published status.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json } from "../_shared/conversations.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const u = new URL(req.url);
    const conversationId = u.searchParams.get("conversation_id");
    if (!conversationId) return json(400, { error: "missing_conversation_id" }, corsHeaders);

    // Enforce visibility (support agents cannot bypass by URL manipulation)
    const { data: vis, error: visErr } = await ctx.admin.rpc("is_conversation_visible_to", {
      _conversation_id: conversationId,
      _user_id: ctx.user.id,
    });
    if (visErr) return json(500, { error: visErr.message }, corsHeaders);
    if (!vis) return json(403, { error: "forbidden" }, corsHeaders);

    const { data, error } = await ctx.admin
      .from("refund_requests_v2")
      .select("id, booking_id, requested_amount, currency, reason, status, requested_by, decided_at, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json(500, { error: error.message }, corsHeaders);

    return json(200, { refund_requests: data ?? [] }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
