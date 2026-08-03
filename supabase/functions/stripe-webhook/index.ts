// =====================================================================
// stripe-webhook — THE single authoritative Stripe webhook endpoint.
//
// Consolidates the former `stripe-webhook` (booking payment_status, refunds,
// disputes, finance_payouts mirror, Connect account sync) and the former
// `stripe-webhook-v7` (double-entry ledger ingestion). `stripe-webhook-v7` is
// deactivated and returns 410 — configure ONLY this URL in Stripe:
//   https://<project>.supabase.co/functions/v1/stripe-webhook
//
// Idempotency contract:
//   * one row per stripe_event_id in public.stripe_webhook_events
//   * the row is reserved with status='processing' BEFORE any handler runs
//   * status becomes 'processed' only after the handler completed
//   * on handler failure the row is marked 'failed' and we return 500 so
//     Stripe retries; a retry re-runs the handler (failed != processed)
//   * out-of-order events never downgrade captured/refunded/partially_refunded
// =====================================================================
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { handleDisputeEvent } from "../_shared/disputes.ts";
import { reconcileProvider } from "../_shared/providerReconcile.ts";
import { ingestLedgerEvent } from "../_shared/stripeLedgerIngest.ts";
import {
  LEDGER_EVENTS,
  TERMINAL_PAYMENT_STATES,
  canApplyPaymentState,
  isHandled,
  paymentStateForEvent,
} from "../_shared/stripeEventRouting.ts";

import { monitored } from "../_shared/logger.ts";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Reserve the event id. 'new' → run handlers, otherwise short-circuit. */
async function reserveEvent(event: Stripe.Event): Promise<"new" | "duplicate" | "in_flight" | "retry"> {
  const { error } = await admin.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    payload: event as unknown as Record<string, unknown>,
    status: "processing",
  });
  if (!error) return "new";
  if ((error as { code?: string }).code === "23505") {
    const { data } = await admin.from("stripe_webhook_events")
      .select("status").eq("stripe_event_id", event.id).maybeSingle();
    if (data?.status === "processed") return "duplicate";
    // A previous delivery failed (or crashed mid-flight) → allow a safe retry.
    if (data?.status === "failed") {
      await admin.from("stripe_webhook_events")
        .update({ status: "processing" }).eq("stripe_event_id", event.id);
      return "retry";
    }
    return "in_flight";
  }
  throw new Error(`reserveEvent: ${(error as { message?: string }).message ?? "unknown"}`);
}

// Only these columns exist on stripe_webhook_events; handler metadata is
// filtered so an unexpected key can never fail the bookkeeping update.
const EVENT_COLUMNS = [
  "payment_intent_id", "charge_id", "refund_id", "transfer_id",
  "payout_id", "booking_id", "amount", "currency",
] as const;

async function markEvent(eventId: string, status: string, extra: Record<string, any> = {}) {
  const patch: Record<string, any> = { status };
  for (const c of EVENT_COLUMNS) if (extra[c] !== undefined) patch[c] = extra[c];
  if (status === "processed") patch.processed_at = new Date().toISOString();
  try {
    await admin.from("stripe_webhook_events")
      .update(patch).eq("stripe_event_id", eventId);
  } catch (e) { console.error("markEvent failed", eventId, status, e); }
}

async function logRejected(errMsg: string, signaturePresent: boolean, secretPresent: boolean) {
  try {
    await admin.from("stripe_webhook_events").insert({
      stripe_event_id: `rejected-${crypto.randomUUID()}`,
      event_type: "webhook.rejected",
      livemode: false,
      payload: { error: errMsg, signature_present: signaturePresent, secret_present: secretPresent } as any,
      status: "rejected",
    });
  } catch (e) { console.error("Failed to log rejected webhook:", e); }
}

// ---------------------------------------------------------------- handlers

async function handleRefundEvent(event: Stripe.Event): Promise<Record<string, any>> {
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
      .select("id, customer_pays, payment_status")
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
        const nextState = isFullRefund ? "refunded" : "partially_refunded";
        if (canApplyPaymentState(booking.payment_status, nextState)) {
          updates.payment_status = nextState;
          if (isFullRefund) updates.status = "cancelled";
        }
      }

      await admin.from("bookings").update(updates).eq("id", booking.id);

      if (succeeded.length > 0) {
        try {
          const projectUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          fetch(`${projectUrl}/functions/v1/credit-note-issue`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({ booking_id: booking.id, stripe_refund_id: last?.id ?? null }),
          }).catch((e) => console.error("credit-note-issue trigger failed (non-fatal):", e));
        } catch (e) {
          console.error("credit-note dispatch failed (non-fatal):", (e as Error).message);
        }
      }
    }
  }

  return {
    payment_intent_id: piId,
    charge_id: charge?.id ?? null,
    refund_id: refund?.id ?? null,
    booking_id: bookingId,
    amount: refund?.amount ?? null,
    currency: refund?.currency ?? null,
  };
}

async function handleTransferPayoutEvent(event: Stripe.Event): Promise<Record<string, any>> {
  const obj = event.data.object as any;
  const transferId = event.type.startsWith("transfer.") ? obj.id : (obj.source_transfer ?? null);
  const payoutId = event.type.startsWith("payout.") ? obj.id : null;

  // Additive: mirror into finance_payouts for the marketplace module.
  try {
    if (event.type.startsWith("transfer.")) {
      const meta = obj.metadata ?? {};
      let bookingId: string | null = meta.booking_id ?? null;
      let providerUserId: string | null = meta.provider_user_id ?? null;
      let providerId: string | null = meta.provider_id ?? null;
      const txRef: string | null = meta.transaction_reference ?? obj.transfer_group ?? null;
      const gross = obj.amount ?? 0;

      const sourceCharge: string | null = obj.source_transaction ?? null;
      let paymentIntentId: string | null = null;
      if (!bookingId && sourceCharge) {
        try {
          const ch = await stripe.charges.retrieve(sourceCharge);
          paymentIntentId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id ?? null;
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
          .eq("id", bookingId).maybeSingle();
        if (bk) {
          platformFee = bk.platform_fee_amount ?? 0;
          netAmount = bk.provider_gets ?? gross;
          paymentIntentId = paymentIntentId ?? bk.payment_intent_id ?? null;
          providerId = providerId ?? bk.provider_id;
        }
      }

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

  return {
    transfer_id: transferId,
    payout_id: payoutId,
    amount: obj.amount ?? null,
    currency: obj.currency ?? null,
  };
}

async function handleAccountUpdated(event: Stripe.Event): Promise<Record<string, any>> {
  const acct = event.data.object as Stripe.Account;
  const { data: prof } = await admin.from("profiles")
    .select("id").eq("stripe_account_id", acct.id).maybeSingle();
  if (prof?.id) {
    const { error: syncErr } = await admin.rpc("provider_profile_service_update_v1", {
      _user_id: prof.id,
      _scope: "stripe_sync",
      _patch: {
        stripe_charges_enabled: !!acct.charges_enabled,
        stripe_payouts_enabled: !!acct.payouts_enabled,
        stripe_details_submitted: !!acct.details_submitted,
        stripe_requirements_due: acct.requirements?.currently_due ?? [],
        stripe_disabled_reason: acct.requirements?.disabled_reason ?? null,
      },
    });
    if (syncErr) throw new Error(`stripe_sync scoped update failed: ${syncErr.message}`);
    await reconcileProvider(admin, prof.id, "stripe_account_updated");
  }
  return {};
}

async function handlePaymentIntentEvent(event: Stripe.Event): Promise<Record<string, any>> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = (pi.metadata as any)?.booking_id ?? null;
  const nextState = paymentStateForEvent(event.type);

  const updates: Record<string, any> = {};
  if (nextState) updates.payment_status = nextState;
  if (nextState === "canceled") updates.status = "cancelled";

  if (nextState === "authorized" || nextState === "captured") {
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
    let q = admin.from("bookings").update(updates).eq("id", bookingId);
    // Guard in SQL as well: never downgrade a terminal money state.
    if (nextState && nextState !== "captured") {
      q = q.not("payment_status", "in", `(${TERMINAL_PAYMENT_STATES.join(",")})`);
    } else if (nextState === "captured") {
      q = q.not("payment_status", "in", "(refunded,partially_refunded)");
    }
    const { error } = await q;
    if (error) throw new Error(`booking update failed: ${error.message}`);
  }

  if (bookingId && nextState === "captured") {
    try {
      const projectUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${projectUrl}/functions/v1/invoice-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ booking_id: bookingId }),
      }).catch((e) => console.error("invoice-issue trigger failed (non-fatal):", e));
    } catch (e) {
      console.error("invoice-issue dispatch failed (non-fatal):", (e as Error).message);
    }
  }

  return {
    payment_intent_id: pi.id ?? null,
    booking_id: bookingId,
    amount: pi.amount ?? null,
    currency: pi.currency ?? null,
  };
}

/** Runs every handler that applies to this event. Throws → Stripe retries. */
async function processEvent(event: Stripe.Event): Promise<Record<string, any>> {
  let meta: Record<string, any> = {};

  if (event.type.startsWith("charge.dispute.")) {
    const res = await handleDisputeEvent(admin, stripe, event);
    meta = {
      dispute_id: res.dispute_id,
      booking_id: res.booking_id,
      amount: (event.data.object as any)?.amount ?? null,
      currency: (event.data.object as any)?.currency ?? null,
    };
  } else if (
    event.type === "charge.refunded" || event.type === "charge.refund.updated" ||
    event.type === "refund.created" || event.type === "refund.updated"
  ) {
    meta = await handleRefundEvent(event);
  } else if (event.type.startsWith("transfer.") || event.type.startsWith("payout.")) {
    meta = await handleTransferPayoutEvent(event);
  } else if (event.type === "account.updated") {
    meta = await handleAccountUpdated(event);
  } else if (event.type.startsWith("payment_intent.")) {
    meta = await handlePaymentIntentEvent(event);
  }

  // v7 ledger ingestion (formerly stripe-webhook-v7). Runs in the same
  // transactionally-idempotent envelope so both paths always execute.
  if (LEDGER_EVENTS.has(event.type)) {
    const ledger = await ingestLedgerEvent(admin, event as any);
    meta = { ...meta, ...ledger };
  }

  return meta;
}

Deno.serve(monitored("stripe-webhook", async (req, _log) => {
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
    await logRejected(errMsg, !!sig, !!secret);
    return new Response(JSON.stringify({ error: "Webhook Error", message: errMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let disposition: Awaited<ReturnType<typeof reserveEvent>>;
  try {
    disposition = await reserveEvent(event);
  } catch (e) {
    console.error("reservation failed", event.id, e);
    return new Response(JSON.stringify({ error: "reservation_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Already processed or currently being processed by another delivery.
  if (disposition === "duplicate" || disposition === "in_flight") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Unknown event types are acknowledged and logged, never acted upon.
  if (!isHandled(event.type)) {
    await markEvent(event.id, "ignored");
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const meta = await processEvent(event);
    await markEvent(event.id, "processed", meta);
    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("handler failed", event.id, event.type, msg);
    // Never mark as processed — Stripe retries and the retry re-runs handlers.
    await markEvent(event.id, "failed");
    return new Response(JSON.stringify({ error: "handler_error", message: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
