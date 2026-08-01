// Booking cancellation with optional Stripe refund.
// Roles: customer (own booking), provider (own booking), admin (any).
// Idempotent via `refund_requests.idempotency_key`.
// Never mutates Stripe without recording the intent first.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { authenticate } from "../_shared/auth.ts";
import { requireActiveProvider } from "../_shared/providerGate.ts";
import { writeAudit } from "../_shared/audit.ts";
import { notifyUser } from "../_shared/notify.ts";
import {
  bookingStartInstant,
  hoursUntilServiceStart,
  policyForSnapshot,
  refundPercentForHours,
  tierForHours,
} from "../_shared/cancellationPolicy.ts";


import { monitored } from "../_shared/logger.ts";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type ReasonCode =
  | "customer_changed_plans"
  | "customer_scheduling_conflict"
  | "provider_unavailable"
  | "provider_no_show"
  | "quality_issue"
  | "duplicate_booking"
  | "fraud"
  | "admin_override"
  | "other";

const VALID_REASONS: ReasonCode[] = [
  "customer_changed_plans","customer_scheduling_conflict","provider_unavailable",
  "provider_no_show","quality_issue","duplicate_booking","fraud","admin_override","other",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Cancellation ladder lives in `_shared/cancellationPolicy.ts` so backend,
// frontend and the Legal Center quote the exact same numbers, and so each
// booking can be evaluated with the policy version it was sold under.




Deno.serve(monitored("booking-cancel", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const body = await req.json().catch(() => ({}));
    const booking_id: string | undefined = body.booking_id;
    const reason_code: ReasonCode = body.reason_code ?? "other";
    const reason_note: string | null = body.reason_note ?? null;
    const requested_refund_amount: number | null =
      typeof body.refund_amount === "number" ? Math.floor(body.refund_amount) : null;
    const idempotency_key: string =
      body.idempotency_key ?? `cancel:${booking_id}:${ctx.user.id}:${Date.now()}`;

    if (!booking_id) return json({ error: "booking_id_required" }, 400);
    if (!VALID_REASONS.includes(reason_code)) return json({ error: "invalid_reason_code" }, 400);

    // ── Load booking + provider profile ────────────────────────────────
    const { data: booking, error: bkErr } = await admin
      .from("bookings")
      .select("id, customer_user_id, provider_id, service, booking_date, slot, timezone, cancellation_policy_snapshot, currency, customer_pays, provider_gets, platform_fee_amount, status, payment_status, payment_intent_id, refund_amount")
      .eq("id", booking_id)
      .maybeSingle();
    if (bkErr || !booking) return json({ error: "booking_not_found" }, 404);

    const { data: providerProfile } = await admin.from("profiles")
      .select("id").eq("provider_id", booking.provider_id).maybeSingle();
    const providerUserId = providerProfile?.id ?? null;

    // ── Authorization ──────────────────────────────────────────────────
    const isAdmin = ctx.isSuperAdmin || ctx.roles.includes("admin");
    const isCustomer = ctx.user.id === booking.customer_user_id;
    const isProvider = providerUserId && ctx.user.id === providerUserId;
    if (!isAdmin && !isCustomer && !isProvider) return json({ error: "forbidden" }, 403);

    const actor_role: "customer" | "provider" | "admin" =
      isAdmin ? "admin" : isCustomer ? "customer" : "provider";

    // Providers may only drive the booking lifecycle while operational.
    // Paused providers keep servicing bookings they already hold.
    if (actor_role === "provider") {
      const cancelGate = await requireActiveProvider(ctx, corsHeaders, { allowPaused: true });
      if (cancelGate instanceof Response) return cancelGate;
    }

    if (["cancelled","completed","declined"].includes(booking.status)) {
      return json({ error: "booking_not_cancellable", status: booking.status }, 409);
    }

    // ── Compute cancellation outcome ───────────────────────────────────
    // The booking is evaluated with the policy version the customer accepted
    // at booking time — never with the newest global ladder.
    const acceptedSnapshot = (booking.cancellation_policy_snapshot ?? {}) as Record<string, unknown>;
    const policy = policyForSnapshot(acceptedSnapshot);

    const nowMs = Date.now();
    // Exact start instant from date + slot + IANA timezone (DST-correct).
    const serviceStart = bookingStartInstant(booking.booking_date, booking.slot, booking.timezone);
    if (!serviceStart) {
      return json({ error: "booking_start_unresolvable", booking_date: booking.booking_date, slot: booking.slot }, 422);
    }
    const serviceStartMs = serviceStart.getTime();
    const hoursUntilService = hoursUntilServiceStart(serviceStartMs, nowMs);

    const captured = booking.payment_status === "captured"
      || booking.payment_status === "partially_refunded";
    const authorized = booking.payment_status === "authorized";
    const previouslyRefunded = booking.refund_amount ?? 0;
    const grossPaid = booking.customer_pays ?? 0;
    const refundable = Math.max(0, grossPaid - previouslyRefunded);

    // Admin can override policy and refund up to `refundable`. Others follow policy.
    let refundAmount = 0;
    let refundType: "none" | "partial" | "full" = "none";
    const applied: Record<string, unknown> = {
      policy_version: policy.version,
      service_start: serviceStart.toISOString(),
      booking_timezone: booking.timezone ?? null,
      hours_until_service: Math.round(hoursUntilService * 10) / 10,
      gross_paid: grossPaid,
      previously_refunded: previouslyRefunded,
      refundable,
    };

    if (captured) {
      if (isAdmin && requested_refund_amount !== null) {
        refundAmount = Math.min(Math.max(0, requested_refund_amount), refundable);
        applied.rule = "admin_override";
      } else if (isProvider) {
        // Provider-initiated cancel = full refund of what customer paid.
        refundAmount = refundable;
        applied.rule = "provider_cancels_full_refund";
      } else {
        const pct = refundPercentForHours(hoursUntilService, policy);
        refundAmount = Math.round(refundable * (pct / 100));
        applied.rule = "customer_policy_by_hours";
        applied.refund_percent = pct;
        applied.policy_tier = tierForHours(hoursUntilService, policy).key;
      }
      refundType = refundAmount === 0 ? "none"
        : refundAmount >= refundable ? "full" : "partial";
    } else if (authorized && booking.payment_intent_id) {
      // Not captured yet → cancel the PaymentIntent (no refund needed).
      applied.rule = "cancel_uncaptured_intent";
    } else {
      applied.rule = "no_payment_action";
    }

    // Preserve the accepted terms; record the applied outcome alongside them.
    const policySnapshot: Record<string, unknown> = { ...acceptedSnapshot, applied };

    // ── Idempotency: check for prior request with same key ─────────────
    const { data: existingReq } = await admin.from("refund_requests")
      .select("id, status, stripe_refund_id, response_snapshot")
      .eq("idempotency_key", idempotency_key).maybeSingle();
    if (existingReq && existingReq.status === "succeeded") {
      return json({ ok: true, idempotent_replay: true, refund_id: existingReq.stripe_refund_id });
    }

    // Insert (or reuse) idempotency ledger row.
    let refundReqId = existingReq?.id ?? null;
    if (!refundReqId) {
      const { data: ins, error: insErr } = await admin.from("refund_requests").insert({
        idempotency_key,
        booking_id: booking.id,
        actor_user_id: ctx.user.id,
        actor_role,
        requested_amount: refundAmount,
        currency: (booking.currency ?? "DKK").toUpperCase(),
        status: refundAmount > 0 ? "pending" : "succeeded",
      }).select("id").maybeSingle();
      if (insErr) return json({ error: `ledger_failed: ${insErr.message}` }, 500);
      refundReqId = ins!.id;
    }

    // ── Stripe action ──────────────────────────────────────────────────
    let stripeRefundId: string | null = null;
    let stripeError: string | null = null;

    if (authorized && booking.payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.payment_intent_id, undefined, {
          idempotencyKey: `pi_cancel:${idempotency_key}`,
        });
      } catch (e) {
        stripeError = (e as Error).message;
      }
    } else if (refundAmount > 0 && booking.payment_intent_id) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: booking.payment_intent_id,
          amount: refundAmount,
          reason: reason_code === "fraud" ? "fraudulent" : "requested_by_customer",
          metadata: {
            booking_id: booking.id,
            actor_user_id: ctx.user.id,
            actor_role,
            reason_code,
          },
          // Reverse the transfer proportionally so the provider is debited
          // for the refunded share. `refund_application_fee` keeps the
          // application-fee ledger consistent when we later use it.
          reverse_transfer: true,
        }, { idempotencyKey: `refund:${idempotency_key}` });
        stripeRefundId = refund.id;
      } catch (e) {
        stripeError = (e as Error).message;
      }
    }

    // ── Update ledger + booking + audit ────────────────────────────────
    await admin.from("refund_requests").update({
      status: stripeError ? "failed" : "succeeded",
      stripe_refund_id: stripeRefundId,
      stripe_error: stripeError,
      response_snapshot: { refund_id: stripeRefundId, error: stripeError },
    }).eq("id", refundReqId);

    if (stripeError) {
      return json({ error: "stripe_failed", detail: stripeError }, 502);
    }

    const bookingUpdates: Record<string, unknown> = {
      status: "cancelled",
      cancelled_by_user_id: ctx.user.id,
      cancelled_by_role: actor_role,
      cancellation_reason_code: reason_code,
      cancellation_policy_snapshot: policySnapshot,
      cancelled_at: new Date().toISOString(),
    };
    if (authorized && !captured) {
      bookingUpdates.payment_status = "canceled";
    }
    await admin.from("bookings").update(bookingUpdates).eq("id", booking.id);

    await admin.from("booking_cancellations").insert({
      booking_id: booking.id,
      actor_user_id: ctx.user.id,
      actor_role,
      reason_code,
      reason_note,
      refund_amount: refundAmount,
      refund_type: refundType,
      currency: (booking.currency ?? "DKK").toUpperCase(),
      policy_snapshot: policySnapshot,
      stripe_refund_id: stripeRefundId,
      stripe_payment_intent_id: booking.payment_intent_id,
    });

    // ── Audit trail (immutable) ────────────────────────────────────────
    await writeAudit(admin, req, {
      actor_user_id: ctx.user.id,
      actor_role,
      action: "booking.cancelled",
      target_type: "booking",
      target_id: booking.id,
      booking_id: booking.id,
      previous_state: { status: booking.status, payment_status: booking.payment_status },
      new_state: { status: "cancelled", payment_status: bookingUpdates.payment_status ?? booking.payment_status },
      refund_amount: refundAmount,
      currency: (booking.currency ?? "DKK").toUpperCase(),
      stripe_refund_id: stripeRefundId,
      stripe_payment_intent_id: booking.payment_intent_id,
      metadata: { reason_code, refund_type: refundType, policy: policySnapshot },
    });

    // ── Customer + provider notifications (in-app + email + push) ──────
    const currencyStr = (booking.currency ?? "DKK").toUpperCase();
    const svc = booking.service ?? "rengøring";
    const bookingRef = `MC-${booking.id.slice(0, 8).toUpperCase()}`;
    const actionUrl = `/mine-bookinger?id=${booking.id}`;

    // Customer
    if (booking.customer_user_id) {
      await notifyUser(admin, {
        user_id: booking.customer_user_id,
        event_type: "booking.cancelled",
        dedupe_key: `booking.cancelled:${booking.id}`,
        subject: `Booking ${bookingRef} annulleret`,
        body: `Din booking af ${svc} er annulleret af ${actor_role}.`,
        vars: { ref: bookingRef, service: svc, actor: actor_role },
        related_booking_id: booking.id,
        action_label: "Se detaljer", action_url: actionUrl,
      });
      if (refundAmount > 0) {
        await notifyUser(admin, {
          user_id: booking.customer_user_id,
          event_type: "refund.initiated",
          dedupe_key: `refund.initiated:${stripeRefundId ?? booking.id}`,
          subject: `Refundering igangsat`,
          body: `Vi har igangsat en refundering på ${(refundAmount/100).toFixed(2)} ${currencyStr}. Beløbet er tilbage på kortet inden for 5-10 hverdage.`,
          vars: { amount: { type: "money", minor: refundAmount, currency: currencyStr } },
          related_booking_id: booking.id,
          action_label: "Se booking", action_url: actionUrl,
          payload: { refund_amount: refundAmount, currency: currencyStr, stripe_refund_id: stripeRefundId },
        });
      }
    }
    // Provider
    if (providerUserId) {
      await notifyUser(admin, {
        user_id: providerUserId,
        event_type: "booking.cancelled.provider",
        dedupe_key: `booking.cancelled.provider:${booking.id}`,
        subject: `Booking ${bookingRef} annulleret`,
        body: `Bookingen af ${svc} den ${booking.booking_date ?? ""} er annulleret af ${actor_role}.`,
        vars: {
          ref: bookingRef,
          service: svc,
          actor: actor_role,
          date: { type: "date", iso: booking.booking_date ?? null },
        },
        related_booking_id: booking.id,
        action_label: "Se booking", action_url: `/provider-dashboard`,
      });
    }


    // Credit note is issued asynchronously by the webhook when the refund
    // event settles (refund.updated → succeeded). We do NOT create it here to
    // avoid double-issuance if Stripe reports the refund as failed later.


    return json({
      ok: true,
      cancelled: true,
      refund_type: refundType,
      refund_amount: refundAmount,
      stripe_refund_id: stripeRefundId,
      policy: policySnapshot,
    });
  } catch (e) {
    console.error("booking-cancel failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
}));
