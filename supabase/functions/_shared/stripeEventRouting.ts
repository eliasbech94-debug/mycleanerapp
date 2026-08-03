// Pure routing/guard helpers for the single authoritative Stripe webhook.
// Kept side-effect free so it can be unit-tested without Deno/Stripe.

/** Money states that must never be downgraded by a replayed / out-of-order event. */
export const TERMINAL_PAYMENT_STATES = ["captured", "refunded", "partially_refunded"] as const;

/** Every payment_status value that exists in the database enum. */
export const PAYMENT_STATES = [
  "none", "authorized", "captured", "canceled",
  "failed", "expired", "refunded", "partially_refunded",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

/** Events the consolidated endpoint acts on (beyond pure logging). */
export const HANDLED_EVENTS = new Set<string>([
  // payment lifecycle
  "payment_intent.amount_capturable_updated",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  // charges & refunds
  "charge.succeeded",
  "charge.updated",
  "charge.refunded",
  "charge.refund.updated",
  "refund.created",
  "refund.updated",
  // connect payouts
  "transfer.created",
  "transfer.reversed",
  "transfer.updated",
  "payout.paid",
  "payout.failed",
  "payout.created",
  // disputes
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  // connect account
  "account.updated",
  // informational
  "balance.available",
]);

/** Events that feed the v7 double-entry ledger ingestion primitives. */
export const LEDGER_EVENTS = new Set<string>([
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

export function isHandled(eventType: string): boolean {
  return HANDLED_EVENTS.has(eventType);
}

export function isTerminalPaymentState(state: string | null | undefined): boolean {
  return !!state && (TERMINAL_PAYMENT_STATES as readonly string[]).includes(state);
}

/**
 * Decides whether a webhook-derived payment_status may be written over the
 * currently stored one. Out-of-order events (an old `authorized` arriving
 * after `captured`, a replayed `failed` after a refund, …) are rejected.
 */
export function canApplyPaymentState(
  current: string | null | undefined,
  next: PaymentState | undefined,
): boolean {
  if (!next) return false;
  if (current === next) return false; // idempotent no-op
  if (!isTerminalPaymentState(current)) return true;
  // From a terminal state only refund progressions are allowed.
  if (current === "captured") return next === "refunded" || next === "partially_refunded";
  if (current === "partially_refunded") return next === "refunded";
  return false; // refunded is final
}

/** Maps a PaymentIntent event type to the payment_status it implies. */
export function paymentStateForEvent(eventType: string): PaymentState | undefined {
  switch (eventType) {
    case "payment_intent.amount_capturable_updated": return "authorized";
    case "payment_intent.succeeded": return "captured";
    case "payment_intent.canceled": return "canceled";
    case "payment_intent.payment_failed": return "failed";
    // requires_action means 3DS is still pending — never a money state.
    case "payment_intent.requires_action": return undefined;
    default: return undefined;
  }
}
