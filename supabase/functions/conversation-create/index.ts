import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  kind: z.enum(["booking_chat", "customer_support", "provider_support", "dispute", "internal", "system"]),
  booking_id: z.string().uuid().optional().nullable(),
  subject: z.string().max(200).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  country_code: z.string().length(2).optional().nullable(),
  extra_participant_ids: z.array(z.string().uuid()).max(20).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { kind, booking_id, subject, priority, country_code, extra_participant_ids } = parsed.data;
    const { admin, user } = ctx;

    // Only staff may open internal / dispute conversations
    if ((kind === "internal" || kind === "dispute") && !isStaff(ctx)) {
      return json(403, { error: "forbidden_kind" }, corsHeaders);
    }

    let customer_user_id: string | null = null;
    let provider_user_id: string | null = null;

    if (kind === "booking_chat") {
      if (!booking_id) return json(400, { error: "booking_id required" }, corsHeaders);
      const { data: b, error: bErr } = await admin
        .from("bookings")
        .select("id, customer_user_id, provider_id")
        .eq("id", booking_id)
        .maybeSingle();
      if (bErr || !b) return json(404, { error: "booking_not_found" }, corsHeaders);
      // resolve provider auth user via profiles
      const { data: pp } = await admin
        .from("profiles").select("id").eq("provider_id", b.provider_id).maybeSingle();
      if (!pp?.id) return json(404, { error: "provider_user_not_found" }, corsHeaders);
      customer_user_id = b.customer_user_id;
      provider_user_id = pp.id;
      if (user.id !== customer_user_id && user.id !== provider_user_id && !isStaff(ctx)) {
        return json(403, { error: "not_booking_party" }, corsHeaders);
      }
      // Duplicate active booking chat guard (unique index will also enforce)
      const { data: dup } = await admin
        .from("conversations")
        .select("id")
        .eq("kind", "booking_chat")
        .eq("booking_id", booking_id)
        .not("status", "in", "(closed,resolved)")
        .maybeSingle();
      if (dup) return json(200, { id: dup.id, existed: true }, corsHeaders);
    } else if (kind === "customer_support") {
      customer_user_id = user.id;
    } else if (kind === "provider_support") {
      provider_user_id = user.id;
    }

    const { data: conv, error: cErr } = await admin
      .from("conversations")
      .insert({
        kind,
        booking_id: booking_id ?? null,
        created_by: user.id,
        customer_user_id,
        provider_user_id,
        subject: subject ?? null,
        priority: priority ?? "normal",
        country_code: country_code ?? null,
        status: "open",
      })
      .select("id")
      .single();
    if (cErr || !conv) return json(500, { error: cErr?.message ?? "insert_failed" }, corsHeaders);

    // Participants
    const participants: { conversation_id: string; user_id: string; participant_role: string }[] = [];
    if (customer_user_id) participants.push({ conversation_id: conv.id, user_id: customer_user_id, participant_role: "customer" });
    if (provider_user_id) participants.push({ conversation_id: conv.id, user_id: provider_user_id, participant_role: "provider" });
    if (isStaff(ctx) && user.id !== customer_user_id && user.id !== provider_user_id) {
      participants.push({ conversation_id: conv.id, user_id: user.id, participant_role: "support" });
    }
    for (const pid of extra_participant_ids ?? []) {
      participants.push({ conversation_id: conv.id, user_id: pid, participant_role: "system" });
    }
    if (participants.length) {
      await admin.from("conversation_participants").upsert(participants, { onConflict: "conversation_id,user_id" });
    }

    await writeEvent(admin, conv.id, user.id, "conversation_created", { kind, booking_id });

    return json(200, { id: conv.id, existed: false }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
