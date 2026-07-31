import { applyCommission, roundHalfAway } from "./pricing.ts";

export type Recurrence = "weekly" | "biweekly" | "monthly";

export interface RecurringQuoteInput {
  baseRateMinor: number;
  totalAdjustmentBps: number;
  durationMinutes: number;
  commissionBps: number;
  discountBps: number;
}

export interface RecurringQuoteResult {
  preDiscountRateMinor: number;
  recurringDiscountMinor: number;
  discountedBaseRateMinor: number;
  adjustedRateMinor: number;
  subtotalMinor: number;
  customerTotalMinor: number;
  providerNetMinor: number;
  platformFeeMinor: number;
}

/**
 * Pricing order for recurring bookings:
 * 1. provider base rate
 * 2. platform-owned recurring discount
 * 3. existing dynamic/weekend/holiday/same-day adjustment
 * 4. commission split
 */
export function recalculateRecurringQuote(input: RecurringQuoteInput): RecurringQuoteResult {
  const { baseRateMinor, totalAdjustmentBps, durationMinutes, commissionBps, discountBps } = input;
  if (!Number.isInteger(baseRateMinor) || baseRateMinor <= 0) throw new Error("invalid_base_rate");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error("invalid_duration");
  }
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 5000) {
    throw new Error("invalid_discount_bps");
  }

  const discountedBaseRateMinor = roundHalfAway(baseRateMinor * (10_000 - discountBps) / 10_000);
  const adjustedRateMinor = roundHalfAway(
    discountedBaseRateMinor * (10_000 + totalAdjustmentBps) / 10_000,
  );
  const subtotalMinor = roundHalfAway(adjustedRateMinor * durationMinutes / 60);
  const commission = applyCommission(subtotalMinor, commissionBps);

  return {
    preDiscountRateMinor: baseRateMinor,
    recurringDiscountMinor: baseRateMinor - discountedBaseRateMinor,
    discountedBaseRateMinor,
    adjustedRateMinor,
    subtotalMinor,
    customerTotalMinor: commission.customerTotalMinor,
    providerNetMinor: commission.providerNetMinor,
    platformFeeMinor: commission.platformFeeMinor,
  };
}
