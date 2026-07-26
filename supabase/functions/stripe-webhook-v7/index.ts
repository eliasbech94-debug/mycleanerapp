// =====================================================================
// stripe-webhook-v7 — Funds Release v7 Step 4
//
// Purpose: Ingest Stripe events into the v7 financial system. This function
// ONLY records events and posts balanced ledger entries via the Step 3
// SECURITY DEFINER ingestion primitives. It NEVER:
//   * creates transfers or payouts
//   * touches the Stripe Transfer/Payout API
//   * releases provider funds
//   * mutates ledger tables directly
//
// Supported events: payment_intent.succeeded, charge.succeeded, charge.updated,
//   charge.refunded, refund.created, refund.updated, balance.available (log),
//   transfer.created, transfer.reversed.
//
// Unknown events are acknowledged with 200 and logged with status='ignored'
// so Stripe stops retrying, but never touch the ledger.
// =====================================================================

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const SUPPORTED = new Set<string>([
  "payment_intent.succeeded",
  "charge.succeeded",
  "charge.updated",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "balance.available",
  "transfer.created",
  "transfer.reversed",
]);

// Idempotency helper: try to reserve an event id. Returns
//   'new'        -> proceed
//   'duplicate'  -> already fully processed; return 200 immediately
//   'in_flight'  -> another delivery is processing; return 200 (Stripe will not retry)
async function reserveEvent(event: Stripe.Event, kindInfo: Record<string, unknown>) {
  const { error } = await admin.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    payload: event as unknown as Record<string, unknown>,
    status: "processing",
    ...kindInfo,
  });
  if (!error) return "new" as const;
  // Unique violation on stripe_event_id → we've seen it.
  if ((error as { code?: string }).code === "23505") {
    const { data } = await admin
      .from("stripe_webhook_events")
      .select("status")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    return data?.status === "processing" ? ("in_flight" as const) : ("duplicate" as const);
  }
  console.error("reserveEvent unexpected insert error", error);
  throw new Error(`reserveEvent: ${(error as { message?: string }).message ?? "unknown"}`);
}

async function markEvent(event_id: string, status: string, extra: Record<string, unknown> = {}) {
  const { error } = await admin
    .from("stripe_webhook_events")
    .update({ status, ...extra })
    .eq("stripe_event_id", event_id);
  if (error) console.error("markEvent failed", event_id, status, error);
}

async function logRejected(event_id_hint: string, message: string, signaturePresent: boolean) {
  try {
    await admin.from("stripe_webhook_events").insert({
      stripe_event_id: `rejected-${crypto.randomUUID()}`,
      event_type: "webhook.rejected",
      livemode: false,
      payload: {
        error: message,
        hint: event_id_hint,
        signature_present: signaturePresent,
        source: "stripe-webhook-v7",
      },
      status: "rejected",
    });
  } catch (e) {
    console.error("failed to log rejected webhook", e);
  }
}

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = ((pi.metadata as Record<string, string>) ?? {}).booking_id ?? null;
  const currency = (pi.currency ?? "dkk").toLowerCase();
  const gross = Number(pi.amount_received ?? pi.amount ?? 0);
  if (gross <= 0) return { status: "ignored_zero_amount" };

  if (!bookingId) {
    // Unlinked capture — post to suspense so we can reclassify later.
    const { error } = await admin.rpc("ingest_payment_captured_suspense_v1", {
      _payment_intent_id: pi.id,
      _gross_minor: gross,
      _currency: currency,
      _raw: pi as unknown as Record<string, unknown>,
    });
    if (error) throw error;
    return { status: "processed_suspense", payment_intent_id: pi.id };
  }

  // Classify best-effort as destination_charge_v1 when transfer_data present,
  // else separate_charge_and_transfer_v1. Never overrides an existing value.
  const flow =
    (pi as unknown as { transfer_data?: unknown }).transfer_data
      ? "destination_charge_v1"
      : "separate_charge_and_transfer_v1";
  {
    const { error } = await admin.rpc("classify_booking_payment_flow_v1", {
      _booking_id: bookingId,
      _flow: flow,
      _reason: `stripe:${event.type}`,
    });
    if (error && !/already classified/i.test(error.message ?? "")) throw error;
  }

  const { error } = await admin.rpc("ingest_payment_captured_v1", {
    _booking_id: bookingId,
    _payment_intent_id: pi.id,
    _gross_minor: gross,
    _currency: currency,
    _raw: pi as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  return { status: "processed_capture", booking_id: bookingId, payment_intent_id: pi.id };
}

async function handleRefund(event: Stripe.Event) {
  // Normalise: both refund.* and charge.refunded flow through here.
  const eventTypesWithCharge = new Set(["charge.refunded", "charge.updated"]);
  let refund: Stripe.Refund | null = null;
  let piId: string | null = null;

  if (eventTypesWithCharge.has(event.type)) {
    const charge = event.data.object as Stripe.Charge;
    piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
    // Take the most recent refund in the payload, if any.
    refund = charge.refunds?.data?.[0] ?? null;
    if (!refund) return { status: "ignored_no_refund" };
  } else {
    refund = event.data.object as Stripe.Refund;
    piId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id ?? null;
  }

  if (!piId || !refund) return { status: "ignored_no_pi" };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, currency")
    .eq("payment_intent_id", piId)
    .maybeSingle();
  if (!booking) {
    // Unknown booking — log the raw event but never mutate the ledger.
    return { status: "ignored_unknown_booking", payment_intent_id: piId };
  }

  const { error } = await admin.rpc("ingest_refund_recorded_v1", {
    _stripe_event_id: event.id,
    _stripe_refund_id: refund.id,
    _booking_id: booking.id,
    _amount_minor: Number(refund.amount ?? 0),
    _currency: (refund.currency ?? booking.currency ?? "dkk").toLowerCase(),
    _status: refund.status ?? "succeeded",
    _stripe_created_at: refund.created ? new Date(refund.created * 1000).toISOString() : null,
    _raw: refund as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  return { status: "processed_refund", booking_id: booking.id, refund_id: refund.id };
}

async function handleTransferEvent(event: Stripe.Event) {
  const t = event.data.object as Stripe.Transfer;
  const kind = event.type === "transfer.created" ? "transfer_created" : "transfer_reversed";
  const sourceCharge =
    typeof (t as unknown as { source_transaction?: string | { id: string } }).source_transaction === "string"
      ? ((t as unknown as { source_transaction: string }).source_transaction)
      : (((t as unknown as { source_transaction?: { id: string } }).source_transaction)?.id ?? null);

  if (!sourceCharge) {
    // Unlinked transfer — record-only, no capacity effect. Skip append to
    // source-linked table (which requires a source_charge_id) but log.
    return { status: "ignored_unlinked_transfer", transfer_id: t.id };
  }

  const meta = (t.metadata ?? {}) as Record<string, string>;
  const bookingId: string | null = meta.booking_id ?? null;
  const currency = (t.currency ?? "dkk").toLowerCase();
  const gross = Number(t.amount ?? 0);
  if (gross <= 0) return { status: "ignored_zero_amount" };

  const { error } = await admin.rpc("ingest_transfer_event_v1", {
    _stripe_event_id: event.id,
    _stripe_transfer_id: t.id,
    _source_charge_id: sourceCharge,
    _booking_id: bookingId,
    _currency: currency,
    _gross_minor: gross,
    _event_kind: kind,
    _stripe_created_at: t.created ? new Date(t.created * 1000).toISOString() : null,
    _raw: t as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  return { status: "processed_transfer_record", transfer_id: t.id, kind };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("Missing signature or secret");
    // Stripe SDK enforces timestamp tolerance (300s) and HMAC verification.
    event = await stripe.webhooks.constructEventAsync(payload, sig, secret);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("v7 signature verification failed:", msg);
    await logRejected("signature_failed", msg, !!sig);
    return new Response(JSON.stringify({ error: "invalid_signature", message: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fast path: unsupported → 200 + log 'ignored'. Never touch the ledger.
  if (!SUPPORTED.has(event.type)) {
    try {
      await admin.from("stripe_webhook_events").insert({
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payload: event as unknown as Record<string, unknown>,
        status: "ignored",
      });
    } catch (e) {
      // If dup key, that's fine.
      const code = (e as { code?: string }).code;
      if (code !== "23505") console.error("ignored event log failed", e);
    }
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Build hint columns for the events row from the event payload.
  const obj = event.data.object as Record<string, unknown>;
  const hint: Record<string, unknown> = {
    payment_intent_id:
      typeof obj.payment_intent === "string"
        ? obj.payment_intent
        : (event.type.startsWith("payment_intent.") ? (obj.id as string) : null),
    charge_id: event.type.startsWith("charge.") ? (obj.id as string) : null,
    refund_id: event.type.startsWith("refund.") ? (obj.id as string) : null,
    transfer_id: event.type.startsWith("transfer.") ? (obj.id as string) : null,
    amount: typeof obj.amount === "number" ? (obj.amount as number) : null,
    currency: typeof obj.currency === "string" ? (obj.currency as string) : null,
  };

  let disposition: Awaited<ReturnType<typeof reserveEvent>>;
  try {
    disposition = await reserveEvent(event, hint);
  } catch (e) {
    console.error("reservation failed", event.id, e);
    return new Response(JSON.stringify({ error: "reservation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (disposition === "duplicate" || disposition === "in_flight") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    let result: Record<string, unknown> = { status: "ignored" };
    switch (event.type) {
      case "payment_intent.succeeded":
        result = await handlePaymentIntentSucceeded(event);
        break;
      case "charge.succeeded":
      case "charge.updated":
        // These arrive as informational for the v7 path unless they carry
        // a refund payload (charge.refunded / charge.updated w/ refunds).
        if (event.type === "charge.updated") {
          const ch = event.data.object as Stripe.Charge;
          if (ch.refunds?.data?.length) result = await handleRefund(event);
          else result = { status: "recorded_only" };
        } else {
          result = { status: "recorded_only" };
        }
        break;
      case "charge.refunded":
      case "refund.created":
      case "refund.updated":
        result = await handleRefund(event);
        break;
      case "balance.available":
        // Log only — no ledger movement.
        result = { status: "logged_balance_available" };
        break;
      case "transfer.created":
      case "transfer.reversed":
        result = await handleTransferEvent(event);
        break;
    }
    await markEvent(event.id, "processed", { booking_id: (result.booking_id as string) ?? null });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("v7 handler error", event.id, event.type, msg);
    // Leave the row so retries collide on the unique key; mark failed for audit.
    await markEvent(event.id, "failed", {});
    // Return 500 so Stripe retries with exponential backoff.
    return new Response(JSON.stringify({ error: "handler_error", message: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
