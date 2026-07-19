import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";

const STATUSES = [
  "open",
  "pending_customer",
  "pending_provider",
  "pending_support",
  "escalated",
  "resolved",
  "closed",
] as const;
type Status = typeof STATUSES[number];

// Allowed transitions. Any status → same status is a no-op we reject.
const TRANSITIONS: Record<Status, Status[]> = {
  open: ["pending_customer", "pending_provider", "pending_support", "escalated", "resolved", "closed"],
  pending_customer: ["open", "pending_provider", "pending_support", "escalated", "resolved", "closed"],
  pending_provider: ["open", "pending_customer", "pending_support", "escalated", "resolved", "closed"],
  pending_support: ["open", "pending_customer", "pending_provider", "escalated", "resolved", "closed"],
  escalated: ["open", "pending_customer", "pending_provider", "pending_support", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

// Transitions requiring an explanatory reason.
function reasonRequired(from: Status, to: Status): boolean {
  if (to === "escalated") return true;
  if (to === "closed") return true;
  if ((from === "resolved" || from === "closed") && to === "open") return true; // reopen
  return false;
}

const Body = z.object({
  conversation_id: z.string().uuid(),
  status: z.enum(STATUSES),
  reason: z.string().trim().max(500).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, status, reason } = parsed.data;
    const { admin, user } = ctx;

    const { data: existing, error: readErr } = await admin
      .from("conversations")
      .select("status")
      .eq("id", conversation_id)
      .maybeSingle();
    if (readErr) return json(500, { error: readErr.message }, corsHeaders);
    if (!existing) return json(404, { error: "not_found" }, corsHeaders);

    const from = existing.status as Status;
    if (from === status) {
      return json(400, { error: "no_op_transition", from, to: status }, corsHeaders);
    }
    if (!TRANSITIONS[from]?.includes(status)) {
      return json(422, { error: "invalid_transition", from, to: status }, corsHeaders);
    }
    if (reasonRequired(from, status) && (!reason || reason.length < 3)) {
      return json(422, { error: "reason_required", from, to: status }, corsHeaders);
    }

    const patch: Record<string, unknown> = { status };
    if (status === "closed" || status === "resolved") {
      patch.closed_at = new Date().toISOString();
      patch.closed_by = user.id;
    } else if (from === "closed" || from === "resolved") {
      patch.closed_at = null;
      patch.closed_by = null;
    }

    const { error } = await admin.from("conversations").update(patch).eq("id", conversation_id);
    if (error) return json(500, { error: error.message }, corsHeaders);
    await writeEvent(admin, conversation_id, user.id, "status_changed", { from, to: status, reason: reason ?? null });
    return json(200, { ok: true, from, to: status }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
