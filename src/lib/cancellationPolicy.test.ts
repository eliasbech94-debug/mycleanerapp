import { describe, it, expect } from "vitest";
import {
  CANCELLATION_TIERS,
  COMPLAINT_WINDOW_HOURS,
  cancellationDeadlines,
  hoursUntilServiceStart,
  refundPercentForHours,
  tierForBooking,
  tierForHours,
} from "./cancellationPolicy";

const H = 3_600_000;

describe("cancellation ladder", () => {
  it("refunds 100% more than 48 hours before start", () => {
    expect(refundPercentForHours(72)).toBe(100);
    expect(refundPercentForHours(48.0001)).toBe(100);
  });

  it("refunds 100% at exactly 48 hours (inclusive bound)", () => {
    expect(refundPercentForHours(48)).toBe(100);
    expect(tierForHours(48).key).toBe("full");
  });

  it("refunds 50% between 24 and 48 hours", () => {
    expect(refundPercentForHours(47.9999)).toBe(50);
    expect(refundPercentForHours(36)).toBe(50);
  });

  it("refunds 50% at exactly 24 hours (inclusive bound)", () => {
    expect(refundPercentForHours(24)).toBe(50);
    expect(tierForHours(24).key).toBe("partial");
  });

  it("refunds 0% less than 24 hours before start", () => {
    expect(refundPercentForHours(23.9999)).toBe(0);
    expect(refundPercentForHours(1)).toBe(0);
    expect(refundPercentForHours(0)).toBe(0);
  });

  it("refunds 0% for a booking that has already started", () => {
    const start = new Date("2026-08-01T10:00:00Z");
    const now = new Date("2026-08-01T10:30:00Z");
    expect(hoursUntilServiceStart(start, now)).toBe(0);
    expect(tierForBooking(start, now).key).toBe("none");
    expect(refundPercentForHours(-12)).toBe(0);
  });

  it("is immune to timezone and DST shifts (absolute instants only)", () => {
    // European DST ends 2026-10-25 03:00 CEST → 02:00 CET. The wall clock
    // between these two instants spans 49 hours, the real elapsed time 48.
    const now = new Date("2026-10-23T22:00:00Z"); // 2026-10-24 00:00 CEST
    const start = new Date("2026-10-25T22:00:00Z"); // 2026-10-25 23:00 CET
    expect(hoursUntilServiceStart(start, now)).toBeCloseTo(48, 9);
    expect(tierForBooking(start, now).key).toBe("full");

    // One millisecond later the same booking drops to the 50% tier.
    const justAfter = new Date(now.getTime() + 1);
    expect(tierForBooking(start, justAfter).key).toBe("partial");
  });

  it("accepts ISO strings from different offsets identically", () => {
    const start = "2026-08-10T08:00:00+02:00";
    const nowUtc = "2026-08-08T06:00:00Z"; // same instant as 08:00+02:00
    expect(hoursUntilServiceStart(start, nowUtc)).toBe(48);
  });
});

describe("cancellationDeadlines", () => {
  const start = new Date("2026-08-10T08:00:00Z");
  const deadlines = cancellationDeadlines(start);

  it("exposes one entry per tier in descending order", () => {
    expect(deadlines.map((d) => d.tier.key)).toEqual(["full", "partial", "none"]);
  });

  it("computes exact cut-off instants", () => {
    expect(deadlines[0].until?.toISOString()).toBe(new Date(start.getTime() - 48 * H).toISOString());
    expect(deadlines[1].until?.toISOString()).toBe(new Date(start.getTime() - 24 * H).toISOString());
    expect(deadlines[2].until).toBeNull();
  });

  it("cut-off instants agree with the ladder evaluation", () => {
    for (const d of deadlines) {
      if (!d.until) continue;
      expect(tierForBooking(start, d.until).key).toBe(d.tier.key);
      expect(tierForBooking(start, new Date(d.until.getTime() + 1)).key).not.toBe(d.tier.key);
    }
  });
});

describe("policy constants", () => {
  it("keeps the approved economic ladder", () => {
    expect(CANCELLATION_TIERS).toEqual([
      { key: "full", minHoursBeforeStart: 48, refundPercent: 100 },
      { key: "partial", minHoursBeforeStart: 24, refundPercent: 50 },
      { key: "none", minHoursBeforeStart: 0, refundPercent: 0 },
    ]);
  });

  it("keeps the 48 hour complaint window", () => {
    expect(COMPLAINT_WINDOW_HOURS).toBe(48);
  });
});
