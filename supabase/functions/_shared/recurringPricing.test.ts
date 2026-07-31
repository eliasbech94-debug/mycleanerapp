import { describe, expect, it } from "vitest";
import { recalculateRecurringQuote } from "./recurringPricing.ts";

describe("recalculateRecurringQuote", () => {
  it("applies recurring discount before surcharge and commission", () => {
    const result = recalculateRecurringQuote({
      baseRateMinor: 30_000,
      discountBps: 1_000,
      totalAdjustmentBps: 1_000,
      durationMinutes: 120,
      commissionBps: 1_400,
    });

    expect(result.preDiscountRateMinor).toBe(30_000);
    expect(result.recurringDiscountMinor).toBe(3_000);
    expect(result.discountedBaseRateMinor).toBe(27_000);
    expect(result.adjustedRateMinor).toBe(29_700);
    expect(result.subtotalMinor).toBe(59_400);
    expect(result.customerTotalMinor).toBe(63_558);
    expect(result.providerNetMinor).toBe(55_242);
    expect(result.platformFeeMinor).toBe(8_316);
  });

  it("handles a recurring discount without dynamic adjustments", () => {
    const result = recalculateRecurringQuote({
      baseRateMinor: 30_000,
      discountBps: 700,
      totalAdjustmentBps: 0,
      durationMinutes: 60,
      commissionBps: 1_400,
    });
    expect(result.discountedBaseRateMinor).toBe(27_900);
    expect(result.subtotalMinor).toBe(27_900);
  });

  it("rejects client-shaped custom discounts outside the allowed bounds", () => {
    expect(() => recalculateRecurringQuote({
      baseRateMinor: 30_000,
      discountBps: 5_001,
      totalAdjustmentBps: 0,
      durationMinutes: 60,
      commissionBps: 1_400,
    })).toThrow("invalid_discount_bps");
  });
});
