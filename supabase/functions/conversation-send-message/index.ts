import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { assertVisible, isStaff, json, MAX_BODY, rateLimit, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().max(MAX_BODY).optional(),
  message_type: z.enum(["text", "attachment", "system", "ai_suggestion"]).optional(),
  is_internal_note: z.boolean().optional(),
  reply_to_message_id: z.string().uuid().optional().nullable(),
  has_attachment: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, body, message_type, is_internal_note, reply_to_message_id, has_attachment } = parsed.data;
    const { admin, user } = ctx;

    if (!rateLimit(`msg:${user.id}`, 30, 60_000)) {
      return json(429, { error: "rate_limited" }, corsHeaders);
    }

    await assertVisible(admin, conversation_id, user.id);

    const text = (body ?? "").trim();
    if (!text && !has_attachment) return json(400, { error: "empty_message" }, corsHeaders);
    if (is_internal_note && !isStaff(ctx)) return json(403, { error: "internal_note_forbidden" }, corsHeaders);

    // Derive sender_role server-side
    let sender_role: "customer" | "provider" | "support" | "admin" | "system";
    if (isStaff(ctx)) {
      sender_role = ctx.isSuperAdmin || ctx.roles.includes("admin" as any) ? "admin" : "support";
    } else {
      // Look up participant role for this conversation
      const { data: p } = await admin
        .from("conversation_participants")
        .select("participant_role")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user.id)
        .maybeSingle();
      sender_role = (p?.participant_role as any) ?? "customer";
      if (!["customer", "provider"].includes(sender_role)) sender_role = "customer";
    }

    const { data: msg, error: mErr } = await admin
      .from("messages")
      .insert({
        conversation_id,
        sender_user_id: user.id,
        sender_role,
        // Authoritative sender_type. Humans only — an AI-sent message is never
        // written through this endpoint (see conversation-request-human).
        sender_type: sender_role === "support" || sender_role === "admin"
          ? "support_agent"
          : sender_role,
        message_type: message_type ?? (has_attachment ? "attachment" : "text"),
        body: text || null,
        is_internal_note: !!is_internal_note,
        reply_to_message_id: reply_to_message_id ?? null,
      })
      .select("id, created_at")
      .single();
    if (mErr || !msg) return json(500, { error: mErr?.message ?? "insert_failed" }, corsHeaders);

    // Notification fan-out: skip for internal notes
    if (!is_internal_note) {
      try {
        const { data: parts } = await admin
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conversation_id)
          .is("left_at", null);
        const recipients = (parts ?? []).map((p) => p.user_id).filter((id) => id !== user.id);
        if (recipients.length) {
          await admin.from("notification_outbox").insert(
            recipients.map((rid) => ({
              user_id: rid,
              channel: "in_app",
              template: "conversation_new_message",
              payload: {
                conversation_id,
                message_id: msg.id,
                sender_role,
                preview: text.slice(0, 140),
              },
              dedupe_key: `conv:${conversation_id}:msg:${msg.id}:${rid}`,
            })),
          );
        }
      } catch (e) {
        console.error("notify_failed", (e as Error).message);
      }
    } else {
      await writeEvent(admin, conversation_id, user.id, "internal_note_added", { message_id: msg.id });
    }

    return json(200, { id: msg.id, created_at: msg.created_at }, corsHeaders);
  } catch (e) {
    const m = (e as Error).message;
    const status = m === "forbidden" ? 403 : 500;
    return json(status, { error: m }, corsHeaders);
  }
});
