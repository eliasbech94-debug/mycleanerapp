// Booking cancellation with optional Stripe refund.
// Roles: customer (own booking), provider (own booking), admin (any).
// Idempotent via `refund_requests.idempotency_key`.
// Never mutates Stripe without recording the intent first.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { notifyUser } from "../_shared/notify.ts";

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

/** Cancellation policy: hours until service start → % refunded of captured amount. */
function policyRefundPercent(hoursUntilService: number): number {
  if (hoursUntilService >= 48) return 100;
  if (hoursUntilService >= 24) return 50;
  return 0;
}

Deno.serve(async (req) => {
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
      .select("id, customer_user_id, provider_id, service, booking_date, slot, currency, customer_pays, provider_gets, platform_fee_amount, status, payment_status, payment_intent_id, refund_amount")
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

    if (["cancelled","completed","declined"].includes(booking.status)) {
      return json({ error: "booking_not_cancellable", status: booking.status }, 409);
    }

    // ── Compute cancellation policy snapshot ───────────────────────────
    const nowMs = Date.now();
    const serviceStartMs = booking.booking_date
      ? new Date(`${booking.booking_date}T00:00:00Z`).getTime() : nowMs;
    const hoursUntilService = Math.max(0, (serviceStartMs - nowMs) / 3_600_000);

    const captured = booking.payment_status === "captured"
      || booking.payment_status === "partially_refunded";
    const authorized = booking.payment_status === "authorized";
    const previouslyRefunded = booking.refund_amount ?? 0;
    const grossPaid = booking.customer_pays ?? 0;
    const refundable = Math.max(0, grossPaid - previouslyRefunded);

    // Admin can override policy and refund up to `refundable`. Others follow policy.
    let refundAmount = 0;
    let refundType: "none" | "partial" | "full" = "none";
    let policySnapshot: Record<string, unknown> = {
      hours_until_service: Math.round(hoursUntilService * 10) / 10,
      gross_paid: grossPaid,
      previously_refunded: previouslyRefunded,
      refundable,
    };

    if (captured) {
      if (isAdmin && requested_refund_amount !== null) {
        refundAmount = Math.min(Math.max(0, requested_refund_amount), refundable);
        policySnapshot.rule = "admin_override";
      } else if (isProvider) {
        // Provider-initiated cancel = full refund of what customer paid.
        refundAmount = refundable;
        policySnapshot.rule = "provider_cancels_full_refund";
      } else {
        const pct = policyRefundPercent(hoursUntilService);
        refundAmount = Math.round(refundable * (pct / 100));
        policySnapshot.rule = "customer_policy_by_hours";
        policySnapshot.refund_percent = pct;
      }
      refundType = refundAmount === 0 ? "none"
        : refundAmount >= refundable ? "full" : "partial";
    } else if (authorized && booking.payment_intent_id) {
      // Not captured yet → cancel the PaymentIntent (no refund needed).
      policySnapshot.rule = "cancel_uncaptured_intent";
    } else {
      policySnapshot.rule = "no_payment_action";
    }

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
});
