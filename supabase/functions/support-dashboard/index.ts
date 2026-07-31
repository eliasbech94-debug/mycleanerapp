// Support workspace dashboard. Support/admin only.
// Returns the sidebar counters plus a scrubbed recent-activity feed built on
// the staff-gated `support_recent_activity` RPC. No raw table access.
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

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20;

    const [counters, activity] = await Promise.all([
      ctx.admin.rpc("support_counters", { _user: ctx.user.id }),
      ctx.admin.rpc("support_recent_activity", { _user: ctx.user.id, _limit: limit }),
    ]);

    if (counters.error) return json(500, { error: counters.error.message }, corsHeaders);
    if (activity.error) return json(500, { error: activity.error.message }, corsHeaders);

    return json(
      200,
      {
        counters: counters.data ?? {},
        recent_activity: (activity.data ?? []).map((r: Record<string, unknown>) => ({
          event_id: r.event_id,
          conversation_id: r.conversation_id,
          event_type: r.event_type,
          created_at: r.created_at,
          conversation_subject: r.conversation_subject,
          conversation_status: r.conversation_status,
          conversation_priority: r.conversation_priority,
          assigned_to_me: r.assigned_to_me,
        })),
      },
      corsHeaders,
    );
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
