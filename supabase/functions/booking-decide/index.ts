// Provider accepts or declines a booking.
// Accept => capture PaymentIntent. Decline => cancel PaymentIntent.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

import { monitored } from "../_shared/logger.ts";
import { authenticate } from "../_shared/auth.ts";
import { requireActiveProvider } from "../_shared/providerGate.ts";
async function stripePost(path: string, key: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${key}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || "Stripe error");
  return j;
}

Deno.serve(monitored("booking-decide", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) throw new Error("Unauthorized");
    const userId = claims.claims.sub;

    const { booking_id, decision } = await req.json();
    if (!booking_id || !["accepted", "declined"].includes(decision)) {
      throw new Error("Invalid input");
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller owns the provider for this booking
    const { data: b } = await admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();
    if (!b) throw new Error("Booking not found");

    const { data: profile } = await admin
      .from("profiles").select("provider_id").eq("id", userId).maybeSingle();
    if (!profile?.provider_id || profile.provider_id !== b.provider_id) {
      throw new Error("Not your booking");
    }
    if (b.status !== "pending") throw new Error(`Already ${b.status}`);

    if (decision === "accepted") {
      if (b.payment_status !== "authorized" || !b.payment_intent_id) {
        throw new Error("Payment not authorized");
      }
      await stripePost(`/payment_intents/${b.payment_intent_id}/capture`, stripeKey);
      await admin.from("bookings").update({
        status: "accepted", payment_status: "captured", decided_at: new Date().toISOString(),
      }).eq("id", booking_id);

      // Create booking chat thread + welcome message + notification prompting cleaning plan
      try {
        const planUrl = `/booking/${booking_id}/plan`;
        const { data: thread } = await admin.from("support_threads").insert({
          user_id: b.customer_user_id,
          topic: "booking",
          subject: "Din rengøring er bekræftet",
          related_booking_id: booking_id,
        }).select("id").single();

        if (thread?.id) {
          await admin.from("support_messages").insert({
            thread_id: thread.id,
            user_id: b.customer_user_id,
            role: "system",
            content:
              "Din booking er bekræftet 🎉\n\nVil du lave en rengøringsplan? Angiv rum, fokusområder (fx ovn, vinduer, kæledyrshår) og noter — så ved din cleaner præcis hvad hun skal fokusere på.\n\nDu kan gemme planen kun til denne rengøring eller som fast plan på boligen.",
            parts: [{ type: "action", label: "Lav rengøringsplan", url: planUrl }],
          });
        }

        await admin.from("customer_notifications").insert({
          user_id: b.customer_user_id,
          kind: "cleaner_message",
          severity: "success",
          title: "Din rengøring er bekræftet",
          body: "Lav en rengøringsplan med fokusområder til din cleaner.",
          action_label: "Lav rengøringsplan",
          action_url: planUrl,
          related_booking_id: booking_id,
          related_thread_id: thread?.id ?? null,
          dedupe_key: `booking-plan-${booking_id}`,
        });
      } catch (e) {
        console.error("plan-prompt failed", (e as Error).message);
      }

    } else {
      if (b.payment_intent_id && ["authorized", "none"].includes(b.payment_status)) {
        try { await stripePost(`/payment_intents/${b.payment_intent_id}/cancel`, stripeKey); }
        catch { /* may already be canceled */ }
      }
      await admin.from("bookings").update({
        status: "declined", payment_status: "canceled", decided_at: new Date().toISOString(),
      }).eq("id", booking_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
