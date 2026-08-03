// conversation-request-human
//
// Escalation from the AI assistant to a real person, callable by any visible
// participant (customer or provider) — not staff-only.
//
// Guarantees:
// - The full conversation history stays on the same conversation row, so the
//   agent inherits every prior message with its immutable `sender_type`.
// - The AI confirms the handover as an `ai_assistant` message (never as a
//   named human) and is marked inactive afterwards.
// - Expected response time is only returned when the platform actually knows
//   it; no fixed promise is invented client-side.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { assertVisible, json, rateLimit, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
  /** Set by the client when the AI answer concerned safety or serious risk. */
  risk: z.boolean().optional(),
});

/** Danish-first confirmation is resolved client-side; the stored copy is neutral. */
const AI_CONFIRMATION_KEY = "ai.handover.confirmation";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, reason, risk } = parsed.data;
    const { admin, user } = ctx;

    if (!rateLimit(`human:${user.id}`, 5, 60_000)) {
      return json(429, { error: "rate_limited" }, corsHeaders);
    }

    await assertVisible(admin, conversation_id, user.id);

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, status, priority, assigned_support_id, human_takeover_at, expected_response_minutes")
      .eq("id", conversation_id)
      .maybeSingle();
    if (convErr || !conv) return json(404, { error: "conversation_not_found" }, corsHeaders);

    // Idempotent: a conversation already waiting for a human is not escalated twice.
    const alreadyHandedOver = !!conv.human_takeover_at;

    if (!alreadyHandedOver) {
      // The AI confirms the handover, attributed to the AI assistant itself.
      const { error: aiErr } = await admin.from("messages").insert({
        conversation_id,
        sender_user_id: null, // enforced by messages_sender_type_guard
        sender_role: "system",
        sender_type: "ai_assistant",
        message_type: "text",
        body:
          "Selvfølgelig — jeg sender samtalen videre til MyCleaner Support, så et menneske kan hjælpe dig.",
        is_internal_note: false,
      });
      if (aiErr) return json(500, { error: aiErr.message }, corsHeaders);

      const { error: upErr } = await admin
        .from("conversations")
        .update({
          status: "escalated",
          priority: risk ? "urgent" : (conv.priority ?? "normal"),
          human_takeover_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);
      if (upErr) return json(500, { error: upErr.message }, corsHeaders);

      await writeEvent(admin, conversation_id, user.id, "escalated", {
        source: "ai_handover",
        requested_by: "participant",
        risk: !!risk,
        reason: reason ?? AI_CONFIRMATION_KEY,
      });
    }

    const { data: fresh } = await admin
      .from("conversations")
      .select("status, human_takeover_at, expected_response_minutes, assigned_support_id")
      .eq("id", conversation_id)
      .maybeSingle();

    let agentFirstName: string | null = null;
    if (fresh?.assigned_support_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("first_name, full_name")
        .eq("id", fresh.assigned_support_id)
        .maybeSingle();
      const raw = (prof as any)?.first_name ?? (prof as any)?.full_name ?? null;
      agentFirstName = raw ? String(raw).trim().split(/\s+/)[0] : null;
    }

    return json(
      200,
      {
        handed_over: true,
        already_handed_over: alreadyHandedOver,
        status: fresh?.status ?? "escalated",
        human_takeover_at: fresh?.human_takeover_at ?? null,
        // null means "unknown" — the UI must not promise a fixed time.
        expected_response_minutes: fresh?.expected_response_minutes ?? null,
        agent_first_name: agentFirstName,
      },
      corsHeaders,
    );
  } catch (e) {
    const m = (e as Error).message;
    return json(m === "forbidden" ? 403 : 500, { error: m }, corsHeaders);
  }
});
