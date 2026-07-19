import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json } from "../_shared/conversations.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "mine";
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const booking = url.searchParams.get("booking_id");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const cursor = url.searchParams.get("cursor"); // ISO timestamp

    const { admin, user } = ctx;
    let q = admin
      .from("conversations")
      .select("id, kind, status, priority, subject, last_message_at, booking_id, customer_user_id, provider_user_id, assigned_support_id, updated_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (cursor) q = q.lt("last_message_at", cursor);
    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);
    if (booking) q = q.eq("booking_id", booking);

    if (!isStaff(ctx)) {
      // Filter to conversations where the caller is a participant
      const { data: parts } = await admin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id)
        .is("left_at", null);
      const ids = (parts ?? []).map((p) => p.conversation_id);
      if (!ids.length) return json(200, { conversations: [] }, corsHeaders);
      q = q.in("id", ids);
    } else if (scope === "mine") {
      q = q.eq("assigned_support_id", user.id);
    } else if (scope === "unassigned") {
      q = q.is("assigned_support_id", null);
    } else if (scope === "escalated") {
      q = q.eq("status", "escalated");
    }

    const { data, error } = await q;
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { conversations: data ?? [] }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
