// Stripe webhook: keeps booking.payment_status in sync.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("Missing signature config");
    event = await stripe.webhooks.constructEventAsync(payload, sig, secret);
  } catch (e) {
    return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = (pi.metadata as any)?.booking_id;
  if (!bookingId) return new Response("ok", { status: 200 });

  const updates: Record<string, any> = {};
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
    case "payment_intent.requires_action":
      updates.payment_status = "authorized";
      break;
    case "payment_intent.succeeded":
      updates.payment_status = "captured";
      break;
    case "payment_intent.canceled":
      updates.payment_status = "canceled";
      if (event.type === "payment_intent.canceled") updates.status = "cancelled";
      break;
    case "payment_intent.payment_failed":
      updates.payment_status = "failed";
      break;
  }
  if (Object.keys(updates).length) {
    await admin.from("bookings").update(updates).eq("id", bookingId);
  }
  return new Response("ok", { status: 200 });
});
