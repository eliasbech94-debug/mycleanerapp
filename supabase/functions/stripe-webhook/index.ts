// Stripe webhook: keeps booking.payment_status in sync, incl. refunds,
// and logs every event to stripe_webhook_events for admin visibility.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function logEvent(event: Stripe.Event, extra: Record<string, any> = {}) {
  try {
    await admin.from("stripe_webhook_events").upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payload: event as any,
      ...extra,
    }, { onConflict: "stripe_event_id" });
  } catch (e) {
    console.error("Failed to log webhook event", e);
  }
}

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
    const errMsg = (e as Error).message;
    console.error("Webhook signature verification failed:", errMsg);

    // Log rejected attempt so admin can see attacks / misconfig
    try {
      const { error: logErr } = await admin.from("stripe_webhook_events").insert({
        stripe_event_id: `rejected-${crypto.randomUUID()}`,
        event_type: "webhook.rejected",
        livemode: false,
        payload: { error: errMsg, signature_present: !!sig, secret_present: !!secret } as any,
        status: "rejected",
      });
      if (logErr) console.error("Failed to log rejected webhook:", logErr);
    } catch (e) { console.error("Failed to log rejected webhook:", e); }

    return new Response(JSON.stringify({ error: "Webhook Error", message: errMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---------- Refund events ----------
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

    let bookingId: string | null = null;
    if (piId) {
      const { data: booking } = await admin
        .from("bookings")
        .select("id, customer_pays")
        .eq("payment_intent_id", piId)
        .maybeSingle();
      bookingId = booking?.id ?? null;

      if (booking) {
        let chargeId: string | null = charge?.id ?? null;
        if (!chargeId) {
          try {
            const piFull = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
            charge = piFull.latest_charge as Stripe.Charge;
            chargeId = charge?.id ?? null;
          } catch (_) { /* ignore */ }
        }

        let allRefunds: Stripe.Refund[] = [];
        if (chargeId) {
          try {
            const list = await stripe.refunds.list({ charge: chargeId, limit: 100 });
            allRefunds = list.data;
          } catch (_) { /* fall back to single refund */ }
        }
        if (allRefunds.length === 0 && refund) allRefunds = [refund];

        const succeeded = allRefunds.filter((r) => r.status === "succeeded" || r.status == null);
        const refundedTotal = succeeded.reduce((s, r) => s + (r.amount ?? 0), 0);
        const captured = charge?.amount_captured ?? 0;
        const isFullRefund = captured > 0 ? refundedTotal >= captured : succeeded.length > 0;

        const refundsJson = allRefunds
          .sort((a, b) => (a.created ?? 0) - (b.created ?? 0))
          .map((r) => ({
            id: r.id,
            amount: r.amount,
            currency: r.currency,
            reason: r.reason ?? null,
            status: r.status ?? "succeeded",
            failure_reason: r.failure_reason ?? null,
            created_at: r.created ? new Date(r.created * 1000).toISOString() : null,
          }));

        const last = succeeded[succeeded.length - 1] ?? refund;
        const updates: Record<string, any> = {
          refunds: refundsJson,
          refund_id: last?.id ?? null,
          refund_reason: last?.reason ?? last?.failure_reason ?? null,
          refund_amount: refundedTotal,
          refunded_at: new Date().toISOString(),
        };
        if (succeeded.length > 0) {
          updates.payment_status = isFullRefund ? "refunded" : "partially_refunded";
          if (isFullRefund) updates.status = "cancelled";
        }

        await admin.from("bookings").update(updates).eq("id", booking.id);
      }
    }

    await logEvent(event, {
      payment_intent_id: piId,
      charge_id: charge?.id ?? null,
      refund_id: refund?.id ?? null,
      booking_id: bookingId,
      amount: refund?.amount ?? null,
      currency: refund?.currency ?? null,
      status: refund?.status ?? "succeeded",
    });
    return new Response("ok", { status: 200 });
  }

  // ---------- Transfer / Payout (split-payout visibility) ----------
  if (event.type.startsWith("transfer.") || event.type.startsWith("payout.")) {
    const obj = event.data.object as any;
    const transferId = event.type.startsWith("transfer.") ? obj.id : (obj.source_transfer ?? null);
    const payoutId = event.type.startsWith("payout.") ? obj.id : null;
    await logEvent(event, {
      transfer_id: transferId,
      payout_id: payoutId,
      amount: obj.amount ?? null,
      currency: obj.currency ?? null,
      status: obj.status ?? null,
    });

    // Additive: mirror into finance_payouts for the marketplace module.
    // Never throws — payment logic above must never be affected.
    try {
      if (event.type.startsWith("transfer.")) {
        const meta = obj.metadata ?? {};
        let bookingId: string | null = meta.booking_id ?? null;
        let providerUserId: string | null = meta.provider_user_id ?? null;
        let providerId: string | null = meta.provider_id ?? null;
        const txRef: string | null = meta.transaction_reference ?? obj.transfer_group ?? null;
        const gross = obj.amount ?? 0;

        // Fallback: resolve booking via source_transaction (destination charge) → payment intent.
        const sourceCharge: string | null = obj.source_transaction ?? null;
        let paymentIntentId: string | null = null;
        if (!bookingId && sourceCharge) {
          try {
            const ch = await stripe.charges.retrieve(sourceCharge);
            paymentIntentId = typeof ch.payment_intent === "string"
              ? ch.payment_intent
              : ch.payment_intent?.id ?? null;
            if (paymentIntentId) {
              const { data: bk } = await admin.from("bookings")
                .select("id, provider_id").eq("payment_intent_id", paymentIntentId).maybeSingle();
              if (bk) { bookingId = bk.id; providerId = providerId ?? bk.provider_id; }
            }
          } catch (_) { /* non-fatal */ }
        }

        let platformFee = 0;
        let netAmount = gross;
        if (bookingId) {
          const { data: bk } = await admin
            .from("bookings")
            .select("platform_fee_amount, provider_gets, payment_intent_id, provider_id")
            .eq("id", bookingId)
            .maybeSingle();
          if (bk) {
            platformFee = bk.platform_fee_amount ?? 0;
            netAmount = bk.provider_gets ?? gross;
            paymentIntentId = paymentIntentId ?? bk.payment_intent_id ?? null;
            providerId = providerId ?? bk.provider_id;
          }
        }

        // Fallback: resolve provider_user_id from profiles via provider_id.
        if (!providerUserId && providerId) {
          const { data: pr } = await admin.from("profiles")
            .select("id").eq("provider_id", providerId).maybeSingle();
          providerUserId = pr?.id ?? null;
        }

        if (providerUserId && transferId) {
          await admin.from("finance_payouts").upsert({
            provider_user_id: providerUserId,
            provider_id: providerId,
            booking_id: bookingId,
            stripe_transfer_id: transferId,
            stripe_charge_id: sourceCharge,
            stripe_payment_intent_id: paymentIntentId,
            gross_amount: gross,
            platform_fee_amount: platformFee,
            net_amount: netAmount,
            currency: (obj.currency ?? "dkk").toUpperCase(),
            status: event.type === "transfer.reversed" ? "reversed" : "in_transit",
            description: obj.description ?? null,
            metadata: {
              source: "transfer",
              event: event.type,
              transaction_reference: txRef,
              transfer_group: obj.transfer_group ?? null,
            },
          }, { onConflict: "stripe_transfer_id" });
        } else {
          console.warn("Transfer without linkable provider_user_id", { transferId, bookingId, providerId });
        }
      } else if (payoutId) {
        const status = event.type === "payout.paid" ? "paid"
          : event.type === "payout.failed" ? "failed"
          : (obj.status ?? "pending");
        await admin.from("finance_payouts").update({
          status,
          arrival_date: obj.arrival_date ? new Date(obj.arrival_date * 1000).toISOString() : null,
          stripe_payout_id: payoutId,
        }).eq("stripe_payout_id", payoutId);
      }
    } catch (e) {
      console.error("finance_payouts mirror failed (non-fatal):", (e as Error).message);
    }

    return new Response("ok", { status: 200 });
  }



  // ---------- PaymentIntent events ----------
  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = (pi.metadata as any)?.booking_id ?? null;

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

  if (bookingId && Object.keys(updates).length) {
    await admin.from("bookings").update(updates).eq("id", bookingId);
  }

  // Additive, non-blocking: issue platform-fee invoice + settlement statement
  // once a booking is captured. Never throws — failures never affect payment.
  if (bookingId && updates.payment_status === "captured") {
    try {
      const projectUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${projectUrl}/functions/v1/invoice-issue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ booking_id: bookingId }),
      }).catch((e) => console.error("invoice-issue trigger failed (non-fatal):", e));
    } catch (e) {
      console.error("invoice-issue dispatch failed (non-fatal):", (e as Error).message);
    }
  }

  await logEvent(event, {
    payment_intent_id: pi.id ?? null,
    booking_id: bookingId,
    amount: pi.amount ?? null,
    currency: pi.currency ?? null,
    status: updates.payment_status ?? pi.status ?? null,
  });
  return new Response("ok", { status: 200 });
});
