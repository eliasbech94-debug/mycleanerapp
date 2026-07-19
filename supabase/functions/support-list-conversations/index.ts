// Support-scoped conversation list. Reuses the shared listConversations
// builder so visibility/filter/pagination remain a single source of truth.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { json } from "../_shared/conversations.ts";
import { listConversations } from "../_shared/conversationQuery.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const forbidden = requireRole(ctx, ["support", "admin"] as any, corsHeaders);
    if (forbidden) return forbidden;

    const u = new URL(req.url);
    const p = u.searchParams;
    const { rows, nextCursor } = await listConversations(ctx, {
      scope: p.get("scope"),
      status: p.get("status"),
      priority: p.get("priority"),
      bookingId: p.get("booking_id"),
      customerUserId: p.get("customer_user_id"),
      providerUserId: p.get("provider_user_id"),
      countryCode: p.get("country"),
      tagId: p.get("tag_id"),
      unreadOnly: p.get("unread_only") === "1",
      search: p.get("q"),
      cursor: p.get("cursor"),
      limit: p.get("limit") ? Number(p.get("limit")) : 50,
    });
    return json(200, { conversations: rows, nextCursor }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
