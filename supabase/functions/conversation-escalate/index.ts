// Server-authoritative escalation. Support/admin only. Sets status=escalated,
// validates priority, writes an immutable event, and notifies all admins via
// the shared notification outbox. Idempotent within a 5-minute window.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";
import { notifyUser } from "../_shared/notify.ts";
import { writeAudit } from "../_shared/audit.ts";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const Body = z.object({
  conversation_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  priority: z.enum(PRIORITIES).optional(),
  internal_note: z.string().trim().max(4000).optional(),
  booking_ref: z.string().trim().max(64).optional(),
  dispute_ref: z.string().trim().max(64).optional(),
  refund_request_id: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, reason, priority, internal_note, booking_ref, dispute_ref, refund_request_id } = parsed.data;
    const { admin, user } = ctx;

    // Load conversation
    const { data: conv, error: readErr } = await admin
      .from("conversations")
      .select("id, status, priority, subject, booking_id, customer_user_id, provider_user_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (readErr) return json(500, { error: readErr.message }, corsHeaders);
    if (!conv) return json(404, { error: "not_found" }, corsHeaders);

    const priorityChanged = priority && priority !== conv.priority;
    const alreadyEscalated = conv.status === "escalated";

    // Duplicate guard: if already escalated AND priority unchanged, reject.
    if (alreadyEscalated && !priorityChanged) {
      return json(409, { error: "already_escalated" }, corsHeaders);
    }

    const patch: Record<string, unknown> = {};
    if (!alreadyEscalated) patch.status = "escalated";
    if (priorityChanged) patch.priority = priority;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("conversations").update(patch).eq("id", conversation_id);
      if (error) return json(500, { error: error.message }, corsHeaders);
    }

    // Optional internal note (staff-only) attached as a message
    if (internal_note && internal_note.length > 0) {
      await admin.from("messages").insert({
        conversation_id,
        sender_user_id: user.id,
        sender_role: ctx.roles.includes("admin" as any) || ctx.isSuperAdmin ? "admin" : "support",
        message_type: "text",
        is_internal_note: true,
        body: internal_note,
      });
    }

    // Immutable timeline event (payload never contains raw admin note body)
    await writeEvent(admin, conversation_id, user.id, "escalated", {
      reason,
      priority: priority ?? conv.priority,
      previous_status: conv.status,
      booking_ref: booking_ref ?? null,
      dispute_ref: dispute_ref ?? null,
      refund_request_id: refund_request_id ?? null,
      had_internal_note: !!internal_note,
    });

    // Notify all admins via outbox. Dedupe within 5-minute bucket per conv.
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    const uniq = Array.from(new Set((admins ?? []).map((r) => r.user_id as string)));
    await Promise.all(uniq.map((uid) =>
      notifyUser(admin, {
        user_id: uid,
        event_type: "support.conversation.escalated",
        dedupe_key: `escalated:${conversation_id}:${bucket}`,
        subject: "Sag eskaleret til administrator",
        body: `Sag "${conv.subject ?? "Uden emne"}" er eskaleret. Årsag: ${reason.slice(0, 240)}`,
        action_label: "Åbn sag",
        action_url: `/support/inbox/${conversation_id}`,
        related_booking_id: conv.booking_id,
        severity: "warning",
        payload: {
          conversation_id,
          priority: priority ?? conv.priority,
          booking_ref: booking_ref ?? null,
          escalated_by: user.id,
        },
      }).catch((e) => console.error("notify_admin_failed", (e as Error).message))
    ));

    // Audit
    await writeAudit(admin, req, {
      actor_user_id: user.id,
      actor_role: ctx.isSuperAdmin ? "super_admin" : (ctx.roles[0] ?? null),
      action: "conversation.escalated",
      target_type: "conversation",
      target_id: conversation_id,
      booking_id: conv.booking_id,
      previous_state: { status: conv.status, priority: conv.priority },
      new_state: { status: "escalated", priority: priority ?? conv.priority },
      metadata: { reason, booking_ref, dispute_ref, refund_request_id },
    });

    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
