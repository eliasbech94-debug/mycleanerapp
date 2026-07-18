// Shared dispute handling. Called from stripe-webhook for all
// `charge.dispute.*` events. Idempotent per (stripe_dispute_id).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type Stripe from "npm:stripe@17";
import { notifyUser } from "./notify.ts";

export async function handleDisputeEvent(
  admin: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<{ dispute_id: string | null; booking_id: string | null }> {
  const dispute = event.data.object as Stripe.Dispute;

  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null;
  let paymentIntentId: string | null = typeof (dispute as any).payment_intent === "string"
    ? (dispute as any).payment_intent
    : (dispute as any).payment_intent?.id ?? null;

  // Resolve booking via charge → payment intent
  let bookingId: string | null = null;
  let customerUserId: string | null = null;
  let providerUserId: string | null = null;
  let providerId: string | null = null;

  if (!paymentIntentId && chargeId) {
    try {
      const ch = await stripe.charges.retrieve(chargeId);
      paymentIntentId = typeof ch.payment_intent === "string"
        ? ch.payment_intent
        : ch.payment_intent?.id ?? null;
    } catch (_) { /* non-fatal */ }
  }

  if (paymentIntentId) {
    const { data: booking } = await admin
      .from("bookings")
      .select("id, customer_id, provider_id")
      .eq("payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (booking) {
      bookingId = booking.id;
      customerUserId = booking.customer_id ?? null;
      providerId = booking.provider_id ?? null;
      if (providerId) {
        const { data: pr } = await admin.from("profiles")
          .select("id").eq("provider_id", providerId).maybeSingle();
        providerUserId = pr?.id ?? null;
      }
    }
  }

  const dueBy = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null;

  const patch: Record<string, unknown> = {
    stripe_dispute_id: dispute.id,
    stripe_charge_id: chargeId,
    stripe_payment_intent_id: paymentIntentId,
    booking_id: bookingId,
    customer_user_id: customerUserId,
    provider_user_id: providerUserId,
    provider_id: providerId,
    amount: dispute.amount ?? 0,
    currency: (dispute.currency ?? "dkk").toUpperCase(),
    reason: dispute.reason ?? null,
    status: dispute.status ?? "needs_response",
    evidence_due_by: dueBy,
    has_evidence: dispute.evidence_details?.has_evidence ?? false,
    submission_count: dispute.evidence_details?.submission_count ?? 0,
    is_charge_refundable: dispute.is_charge_refundable ?? null,
    livemode: dispute.livemode ?? false,
    last_event_at: new Date().toISOString(),
    metadata: {
      network_reason_code: (dispute as any).network_reason_code ?? null,
      balance_transactions: dispute.balance_transactions?.length ?? 0,
    },
  };

  if (event.type === "charge.dispute.funds_withdrawn") {
    patch.funds_withdrawn_at = new Date().toISOString();
  }
  if (event.type === "charge.dispute.funds_reinstated") {
    patch.funds_reinstated_at = new Date().toISOString();
  }
  if (event.type === "charge.dispute.closed") {
    patch.closed_at = new Date().toISOString();
    patch.outcome = dispute.status; // won | lost | warning_closed
  }

  const { data: upserted, error } = await admin
    .from("stripe_disputes")
    .upsert(patch, { onConflict: "stripe_dispute_id" })
    .select("id, provider_user_id, customer_user_id, booking_id")
    .single();
  if (error) {
    console.error("dispute upsert failed", error);
    return { dispute_id: null, booking_id: bookingId };
  }

  // Notifications (idempotent via dedupe_key)
  const disputeUuid = upserted.id;
  if (upserted.provider_user_id) {
    if (event.type === "charge.dispute.created") {
      await notifyUser(admin, {
        user_id: upserted.provider_user_id,
        event_type: "dispute.opened.provider",
        dedupe_key: `dispute:${dispute.id}:opened`,
        subject: "Ny betalingsindsigelse (chargeback)",
        body: `En kunde har åbnet en betalingsindsigelse på ${(dispute.amount / 100).toFixed(2)} ${(dispute.currency ?? "dkk").toUpperCase()}. Send dokumentation inden fristen.`,
        severity: "warning",
        action_label: "Se sag",
        action_url: `/provider/disputes/${disputeUuid}`,
        related_booking_id: upserted.booking_id,
      });
    }
    if (event.type === "charge.dispute.closed") {
      await notifyUser(admin, {
        user_id: upserted.provider_user_id,
        event_type: "dispute.resolved.provider",
        dedupe_key: `dispute:${dispute.id}:closed:${dispute.status}`,
        subject: `Sagen er afsluttet: ${dispute.status}`,
        body: dispute.status === "won"
          ? "Vi vandt indsigelsen. Midlerne er reinstateret."
          : dispute.status === "lost"
          ? "Indsigelsen blev tabt. Beløbet fratrækkes din næste udbetaling."
          : `Sagen er lukket med status: ${dispute.status}.`,
        severity: dispute.status === "won" ? "success" : "error",
        action_label: "Se sag",
        action_url: `/provider/disputes/${disputeUuid}`,
        related_booking_id: upserted.booking_id,
      });
    }
  }

  // Adjust finance: on funds_withdrawn create a settlement debit alert
  if (event.type === "charge.dispute.funds_withdrawn" && upserted.provider_user_id) {
    try {
      await admin.from("finance_reconciliation_alerts").upsert({
        booking_id: upserted.booking_id,
        code: "dispute_funds_withdrawn",
        severity: "warning",
        message: `Stripe har trukket ${(dispute.amount / 100).toFixed(2)} ${(dispute.currency ?? "dkk").toUpperCase()} fra platformens balance pga. indsigelse ${dispute.id}.`,
        details: { dispute_id: disputeUuid, stripe_dispute_id: dispute.id },
      }, { onConflict: "booking_id,code", ignoreDuplicates: false });
    } catch (e) {
      console.error("dispute alert insert failed", e);
    }
  }

  return { dispute_id: disputeUuid, booking_id: bookingId };
}
