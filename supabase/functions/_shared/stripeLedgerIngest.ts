// v7 double-entry ledger ingestion, extracted from the retired
// `stripe-webhook-v7` endpoint so the single authoritative webhook can run it.
//
// This module ONLY records events and posts balanced ledger entries via the
// SECURITY DEFINER ingestion primitives. It never creates transfers or
// payouts, never releases provider funds and never mutates ledger tables
// directly.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type AnyEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export type LedgerResult = Record<string, unknown>;

async function handlePaymentIntentSucceeded(admin: SupabaseClient, event: AnyEvent): Promise<LedgerResult> {
  const pi = event.data.object as Record<string, any>;
  const bookingId = (pi.metadata ?? {}).booking_id ?? null;
  const currency = String(pi.currency ?? "dkk").toLowerCase();
  const gross = Number(pi.amount_received ?? pi.amount ?? 0);
  if (gross <= 0) return { ledger: "ignored_zero_amount" };

  if (!bookingId) {
    const { error } = await admin.rpc("ingest_payment_captured_suspense_v1", {
      _payment_intent_id: pi.id,
      _gross_minor: gross,
      _currency: currency,
      _raw: pi,
    });
    if (error) throw error;
    return { ledger: "processed_suspense", payment_intent_id: pi.id };
  }

  const flow = pi.transfer_data ? "destination_charge_v1" : "separate_charge_and_transfer_v1";
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
    _raw: pi,
  });
  if (error) throw error;
  return { ledger: "processed_capture", booking_id: bookingId, payment_intent_id: pi.id };
}

async function handleRefund(admin: SupabaseClient, event: AnyEvent): Promise<LedgerResult> {
  const withCharge = event.type === "charge.refunded" || event.type === "charge.updated";
  let refund: Record<string, any> | null = null;
  let piId: string | null = null;

  if (withCharge) {
    const charge = event.data.object as Record<string, any>;
    piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
    refund = charge.refunds?.data?.[0] ?? null;
    if (!refund) return { ledger: "ignored_no_refund" };
  } else {
    refund = event.data.object as Record<string, any>;
    piId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id ?? null;
  }
  if (!piId || !refund) return { ledger: "ignored_no_pi" };

  const { data: booking } = await admin
    .from("bookings").select("id, currency").eq("payment_intent_id", piId).maybeSingle();
  if (!booking) return { ledger: "ignored_unknown_booking", payment_intent_id: piId };

  const { error } = await admin.rpc("ingest_refund_recorded_v1", {
    _stripe_event_id: event.id,
    _stripe_refund_id: refund.id,
    _booking_id: booking.id,
    _amount_minor: Number(refund.amount ?? 0),
    _currency: String(refund.currency ?? booking.currency ?? "dkk").toLowerCase(),
    _status: refund.status ?? "succeeded",
    _stripe_created_at: refund.created ? new Date(refund.created * 1000).toISOString() : null,
    _raw: refund,
  });
  if (error) throw error;
  return { ledger: "processed_refund", booking_id: booking.id, refund_id: refund.id };
}

async function handleTransferEvent(admin: SupabaseClient, event: AnyEvent): Promise<LedgerResult> {
  const t = event.data.object as Record<string, any>;
  const kind = event.type === "transfer.created" ? "transfer_created" : "transfer_reversed";
  const sourceCharge = typeof t.source_transaction === "string"
    ? t.source_transaction
    : t.source_transaction?.id ?? null;
  if (!sourceCharge) return { ledger: "ignored_unlinked_transfer", transfer_id: t.id };

  const gross = Number(t.amount ?? 0);
  if (gross <= 0) return { ledger: "ignored_zero_amount" };

  const { error } = await admin.rpc("ingest_transfer_event_v1", {
    _stripe_event_id: event.id,
    _stripe_transfer_id: t.id,
    _source_charge_id: sourceCharge,
    _booking_id: (t.metadata ?? {}).booking_id ?? null,
    _currency: String(t.currency ?? "dkk").toLowerCase(),
    _gross_minor: gross,
    _event_kind: kind,
    _stripe_created_at: t.created ? new Date(t.created * 1000).toISOString() : null,
    _raw: t,
  });
  if (error) throw error;
  return { ledger: "processed_transfer_record", transfer_id: t.id, kind };
}

/**
 * Runs the v7 ledger ingestion for a supported event. Throws on failure so the
 * caller can mark the webhook event as failed and let Stripe retry.
 */
export async function ingestLedgerEvent(admin: SupabaseClient, event: AnyEvent): Promise<LedgerResult> {
  switch (event.type) {
    case "payment_intent.succeeded":
      return await handlePaymentIntentSucceeded(admin, event);
    case "charge.updated": {
      const ch = event.data.object as Record<string, any>;
      return ch.refunds?.data?.length ? await handleRefund(admin, event) : { ledger: "recorded_only" };
    }
    case "charge.succeeded":
      return { ledger: "recorded_only" };
    case "charge.refunded":
    case "refund.created":
    case "refund.updated":
      return await handleRefund(admin, event);
    case "transfer.created":
    case "transfer.reversed":
      return await handleTransferEvent(admin, event);
    case "balance.available":
      return { ledger: "logged_balance_available" };
    default:
      return { ledger: "not_applicable" };
  }
}
