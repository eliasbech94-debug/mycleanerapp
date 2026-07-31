import { describe, expect, it } from "vitest";
import {
  RECURRING_DISCOUNT_BPS,
  calculateRecurringRate,
  nextOccurrenceAt,
} from "./recurringPricing";

describe("recurringPricing", () => {
  it.each([
    ["weekly", 1_000, 27_000],
    ["biweekly", 700, 27_900],
    ["monthly", 500, 28_500],
  ] as const)("uses fixed %s rate", (recurrence, discountBps, expectedMinor) => {
    expect(RECURRING_DISCOUNT_BPS[recurrence]).toBe(discountBps);
    expect(calculateRecurringRate(30_000, recurrence)).toEqual({
      baseRateMinor: 30_000,
      discountBps,
      discountMinor: 30_000 - expectedMinor,
      discountedRateMinor: expectedMinor,
    });
  });

  it("rounds minor units deterministically", () => {
    expect(calculateRecurringRate(19_995, "weekly").discountedRateMinor).toBe(17_996);
  });

  it("rejects invalid provider-entered percentages", () => {
    expect(() => calculateRecurringRate(30_000, "weekly", -1)).toThrow("invalid_discount_bps");
    expect(() => calculateRecurringRate(30_000, "weekly", 5_001)).toThrow("invalid_discount_bps");
  });

  it("calculates weekly, biweekly and monthly occurrences", () => {
    const start = new Date("2026-01-31T10:00:00.000Z");
    expect(nextOccurrenceAt(start, "weekly").toISOString()).toBe("2026-02-07T10:00:00.000Z");
    expect(nextOccurrenceAt(start, "biweekly").toISOString()).toBe("2026-02-14T10:00:00.000Z");
    expect(nextOccurrenceAt(start, "monthly").toISOString()).toBe("2026-03-03T10:00:00.000Z");
  });
});
