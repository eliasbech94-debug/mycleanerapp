export type BookingRecurrence = "weekly" | "biweekly" | "monthly";

export const RECURRING_DISCOUNT_BPS: Readonly<Record<BookingRecurrence, number>> = Object.freeze({
  weekly: 1_000,
  biweekly: 700,
  monthly: 500,
});

export interface RecurringPriceBreakdown {
  baseRateMinor: number;
  discountBps: number;
  discountMinor: number;
  discountedRateMinor: number;
}

/**
 * Deterministic half-away-from-zero rounding for positive monetary values.
 * Mirrors the server pricing convention and avoids floating-point display drift.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error("invalid_money_value");
  return Math.floor(value + 0.5);
}

export function calculateRecurringRate(
  baseRateMinor: number,
  recurrence: BookingRecurrence,
  discountBps = RECURRING_DISCOUNT_BPS[recurrence],
): RecurringPriceBreakdown {
  if (!Number.isInteger(baseRateMinor) || baseRateMinor <= 0) {
    throw new Error("invalid_base_rate");
  }
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 5_000) {
    throw new Error("invalid_discount_bps");
  }

  const discountedRateMinor = roundMoney(baseRateMinor * (10_000 - discountBps) / 10_000);
  return {
    baseRateMinor,
    discountBps,
    discountMinor: baseRateMinor - discountedRateMinor,
    discountedRateMinor,
  };
}

export function nextOccurrenceAt(
  current: Date,
  recurrence: BookingRecurrence,
): Date {
  if (Number.isNaN(current.getTime())) throw new Error("invalid_occurrence_date");
  const next = new Date(current.getTime());
  if (recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (recurrence === "biweekly") next.setUTCDate(next.getUTCDate() + 14);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
