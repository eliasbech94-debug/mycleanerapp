import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";

type Room = { name: string; tasks: { label: string; checked: boolean }[] };

function formatPlan(opts: {
  customerName: string;
  bookingDate: string;
  rooms: Room[];
  focus: string[];
  notes: string;
}) {
  const { customerName, bookingDate, rooms, focus, notes } = opts;
  const d = new Date(bookingDate).toLocaleDateString("da-DK");
  let out = `📋 **Rengøringsplan fra ${customerName}** — booking den ${d}\n\n`;
  if (focus.length) out += `**Fokusområder:** ${focus.join(", ")}\n\n`;
  for (const r of rooms) {
    const active = r.tasks.filter((t) => t.checked);
    if (!active.length) continue;
    out += `**${r.name}**\n`;
    for (const t of active) out += `• ${t.label}\n`;
    out += `\n`;
  }
  if (notes.trim()) out += `**Noter:**\n${notes.trim()}\n`;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const { admin, user } = ctx;

    const { booking_id } = await req.json();
    if (!booking_id || typeof booking_id !== "string") {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load booking and enforce ownership
    const { data: booking, error: bErr } = await admin
      .from("bookings").select("*").eq("id", booking_id).maybeSingle();
    if (bErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (booking.customer_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look for a plan tied to this booking, else address plan
    let plan: any = null;
    const { data: bp } = await admin.from("cleaning_plans")
      .select("*").eq("user_id", user.id).eq("booking_id", booking_id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (bp) plan = bp;
    else if (booking.address_place_id) {
      const { data: addr } = await admin.from("customer_addresses")
        .select("id").eq("user_id", user.id).eq("address_place_id", booking.address_place_id).maybeSingle();
      if (addr) {
        const { data: pp } = await admin.from("cleaning_plans")
          .select("*").eq("user_id", user.id).eq("address_id", addr.id).eq("scope", "property")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (pp) plan = pp;
      }
    }
    if (!plan) {
      return new Response(JSON.stringify({ error: "no_plan" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve provider auth user
    const { data: providerProfile } = await admin
      .from("profiles").select("id, full_name")
      .eq("provider_id", booking.provider_id).maybeSingle();
    if (!providerProfile?.id) {
      return new Response(JSON.stringify({ error: "Provider user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Customer name
    const { data: custProfile } = await admin
      .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const customerName = custProfile?.full_name || "Kunde";

    const content = formatPlan({
      customerName,
      bookingDate: booking.booking_date,
      rooms: plan.rooms || [],
      focus: plan.focus_areas || [],
      notes: plan.notes || "",
    });

    // Find or create a provider-owned booking thread
    let threadId: string | null = null;
    const { data: existingThread } = await admin
      .from("support_threads").select("id")
      .eq("user_id", providerProfile.id)
      .eq("related_booking_id", booking_id)
      .eq("topic", "booking")
      .maybeSingle();

    if (existingThread) {
      threadId = existingThread.id;
      await admin.from("support_threads")
        .update({ last_message_at: new Date().toISOString(), subject: `Rengøringsplan — ${customerName}` })
        .eq("id", threadId);
    } else {
      const { data: newThread, error: tErr } = await admin.from("support_threads").insert({
        user_id: providerProfile.id,
        topic: "booking",
        subject: `Rengøringsplan — ${customerName}`,
        related_booking_id: booking_id,
      }).select("id").single();
      if (tErr) throw tErr;
      threadId = newThread.id;
    }

    // Post system message with plan
    await admin.from("support_messages").insert({
      thread_id: threadId,
      user_id: providerProfile.id,
      role: "system",
      content,
      parts: { plan_id: plan.id, booking_id, focus_areas: plan.focus_areas, rooms: plan.rooms, notes: plan.notes },
    });

    // Notification to provider (upsert by dedupe_key so re-sends refresh)
    const dedupe = `plan-${booking_id}`;
    // Best-effort: delete any prior non-dismissed notification with same dedupe to allow re-insert
    await admin.from("customer_notifications")
      .delete()
      .eq("user_id", providerProfile.id)
      .eq("dedupe_key", dedupe)
      .is("dismissed_at", null);

    await admin.from("customer_notifications").insert({
      user_id: providerProfile.id,
      kind: "cleaner_message",
      severity: "info",
      title: `Ny rengøringsplan fra ${customerName}`,
      body: `Kunden har delt en plan til bookingen den ${new Date(booking.booking_date).toLocaleDateString("da-DK")}.`,
      action_label: "Åbn plan",
      action_url: `/inbox?thread=${threadId}`,
      related_booking_id: booking_id,
      related_thread_id: threadId,
      dedupe_key: dedupe,
    });

    return new Response(JSON.stringify({ ok: true, thread_id: threadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
