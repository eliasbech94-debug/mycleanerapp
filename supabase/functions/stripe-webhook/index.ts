// Stripe webhook: keeps booking.payment_status in sync, incl. refunds.
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

  // ---------- Refund events ----------
  // charge.refunded fires when a refund is created on a charge.
  // refund.updated fires on status changes (e.g. failed → succeeded).
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.refund.updated" ||
    event.type === "refund.created" ||
    event.type === "refund.updated"
  ) {
    let piId: string | null = null;
    let refund: Stripe.Refund | null = null;
    let charge: Stripe.Charge | null = null;

    if (event.type.startsWith("charge.")) {
      charge = event.data.object as Stripe.Charge;
      piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
      refund = charge.refunds?.data?.[0] ?? null;
    } else {
      refund = event.data.object as Stripe.Refund;
      piId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id ?? null;
    }
    if (!piId) return new Response("ok", { status: 200 });

    // Find the booking via payment_intent_id
    const { data: booking } = await admin
      .from("bookings")
      .select("id, customer_pays")
      .eq("payment_intent_id", piId)
      .maybeSingle();
    if (!booking) return new Response("ok", { status: 200 });

    // Pull full charge for accurate totals if we don't have it yet
    if (!charge) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
        charge = pi.latest_charge as Stripe.Charge;
      } catch (_) { /* ignore */ }
    }

    const refunded = (charge?.amount_refunded ?? refund?.amount ?? 0);
    const captured = charge?.amount_captured ?? 0;
    const isFullRefund = captured > 0 ? refunded >= captured : true;

    const updates: Record<string, any> = {
      refund_id: refund?.id ?? null,
      refund_reason: refund?.reason ?? refund?.failure_reason ?? null,
      refund_amount: refunded,
      refunded_at: new Date().toISOString(),
    };
    if (refund?.status === "succeeded" || refund?.status == null) {
      updates.payment_status = isFullRefund ? "refunded" : "partially_refunded";
      if (isFullRefund) updates.status = "cancelled";
    }

    await admin.from("bookings").update(updates).eq("id", booking.id);
    return new Response("ok", { status: 200 });
  }

  // ---------- PaymentIntent events ----------
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
      updates.status = "cancelled";
      break;
    case "payment_intent.payment_failed":
      updates.payment_status = "failed";
      break;
  }

  // Capture card brand + last4 for receipts when payment is authorized or succeeded.
  if (updates.payment_status === "authorized" || updates.payment_status === "captured") {
    try {
      const pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
      if (pmId) {
        const pm = await stripe.paymentMethods.retrieve(pmId);
        if (pm.card) {
          updates.payment_method_brand = pm.card.brand;
          updates.payment_method_last4 = pm.card.last4;
        }
      }
    } catch (_) { /* non-fatal */ }
  }

  if (Object.keys(updates).length) {
    await admin.from("bookings").update(updates).eq("id", bookingId);
  }
  return new Response("ok", { status: 200 });
});
