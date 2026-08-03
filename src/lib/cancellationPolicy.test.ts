import { describe, it, expect } from "vitest";
import {
  COMPLAINT_WINDOW_HOURS,
  LEGACY_CANCELLATION_POLICY_VERSION,
  bookingStartInstant,
  policyForSnapshot,
  policyForVersion,
  hoursUntilServiceStart,
  type CancellationPolicy,
  cancellationCutoffs as _cancellationCutoffs,
  cancellationDeadlines as _cancellationDeadlines,
  cancellationPolicySnapshot as _cancellationPolicySnapshot,
  refundPercentForHours as _refundPercentForHours,
  tierForBooking as _tierForBooking,
  tierForHours as _tierForHours,
} from "./cancellationPolicy";

// These suites describe the v2 (18/8) ladder itself, independently of the
// coordinated activation instant. Activation behaviour is covered in
// `cancellationPolicy.activation.test.ts`.
const V2 = policyForVersion("2.0.0");
const refundPercentForHours = (h: number, p: CancellationPolicy = V2) => _refundPercentForHours(h, p);
const tierForHours = (h: number, p: CancellationPolicy = V2) => _tierForHours(h, p);
const tierForBooking = (
  start: Date | string | number,
  now: Date | string | number,
  p: CancellationPolicy = V2,
) => _tierForBooking(start, now, p);
const cancellationCutoffs = (start: Date | string | number, p: CancellationPolicy = V2) =>
  _cancellationCutoffs(start, p);
const cancellationDeadlines = (start: Date | string | number, p: CancellationPolicy = V2) =>
  _cancellationDeadlines(start, p);
const cancellationPolicySnapshot = (p: CancellationPolicy = V2) => _cancellationPolicySnapshot(p);

const H = 3_600_000;

describe("cancellation ladder (v2 — 18/8)", () => {
  it("is the current policy version", () => {
    expect(V2.version).toBe("2.0.0");
    expect(policyForVersion("2.0.0")).toBe(V2);
  });

  it("refunds 100% more than 18 hours before start", () => {
    expect(refundPercentForHours(72)).toBe(100);
    expect(refundPercentForHours(19)).toBe(100);
    expect(refundPercentForHours(18.0001)).toBe(100);
    expect(tierForHours(19).key).toBe("full");
  });

  it("refunds 50% at exactly 18 hours (exclusive upper bound)", () => {
    expect(refundPercentForHours(18)).toBe(50);
    expect(tierForHours(18).key).toBe("partial");
  });

  it("refunds 50% between 8 and 18 hours", () => {
    expect(refundPercentForHours(17.9999)).toBe(50);
    expect(refundPercentForHours(12)).toBe(50);
    expect(refundPercentForHours(8.0001)).toBe(50);
  });

  it("refunds 50% at exactly 8 hours (inclusive bound)", () => {
    expect(refundPercentForHours(8)).toBe(50);
    expect(tierForHours(8).key).toBe("partial");
  });

  it("refunds 0% less than 8 hours before start", () => {
    expect(refundPercentForHours(7.9999)).toBe(0);
    expect(refundPercentForHours(1)).toBe(0);
    expect(refundPercentForHours(0)).toBe(0);
    expect(tierForHours(1).key).toBe("none");
  });

  it("refunds 0% after the service has started", () => {
    const start = new Date("2026-08-10T09:00:00Z");
    const after = new Date(start.getTime() + 3 * H);
    expect(hoursUntilServiceStart(start, after)).toBe(0);
    expect(tierForBooking(start, after).refundPercent).toBe(0);
  });

  it("keeps the complaint window at 48 hours", () => {
    expect(COMPLAINT_WINDOW_HOURS).toBe(48);
  });
});

describe("timezone and DST", () => {
  it("is immune to timezone and DST shifts because it compares instants", () => {
    const start = new Date("2026-10-25T09:00:00+02:00"); // CEST → CET night
    const now = new Date(start.getTime() - 19 * H);
    expect(tierForBooking(start, now).refundPercent).toBe(100);
    expect(tierForBooking(start, new Date(start.getTime() - 18 * H)).refundPercent).toBe(50);
  });

  it("accepts ISO strings with different offsets identically", () => {
    const a = tierForBooking("2026-08-10T09:00:00Z", "2026-08-09T14:00:00Z");
    const b = tierForBooking("2026-08-10T11:00:00+02:00", "2026-08-09T16:00:00+02:00");
    expect(a.key).toBe(b.key);
  });

  it("resolves a booking start from date + slot + IANA timezone", () => {
    expect(bookingStartInstant("2026-08-10", "09:00", "Europe/Copenhagen")!.toISOString())
      .toBe("2026-08-10T07:00:00.000Z"); // CEST = UTC+2
    expect(bookingStartInstant("2026-01-10", "09:00", "Europe/Copenhagen")!.toISOString())
      .toBe("2026-01-10T08:00:00.000Z"); // CET = UTC+1
    expect(bookingStartInstant("2026-08-10", "09:00", "Europe/London")!.toISOString())
      .toBe("2026-08-10T08:00:00.000Z");
  });

  it("never falls back to midnight UTC on malformed input", () => {
    expect(bookingStartInstant("2026-08-10", null)).toBeNull();
    expect(bookingStartInstant("2026-08-10", "9am")).toBeNull();
    expect(bookingStartInstant("not-a-date", "09:00")).toBeNull();
  });

  it("uses the slot, not midnight, when deciding the tier", () => {
    // Booking 10 Aug 18:00 local; now is 10 Aug 06:00 local → 12 h → 50 %.
    const start = bookingStartInstant("2026-08-10", "18:00", "Europe/Copenhagen")!;
    const now = new Date(start.getTime() - 12 * H);
    expect(tierForBooking(start, now).refundPercent).toBe(50);
    // Midnight-UTC maths would have produced a negative/0 delta and 0 %.
    expect(refundPercentForHours(hoursUntilServiceStart(start, now))).toBe(50);
  });
});

describe("non-retroactivity", () => {
  it("keeps the legacy 48/24 ladder available", () => {
    const legacy = policyForVersion(LEGACY_CANCELLATION_POLICY_VERSION);
    expect(legacy.version).toBe("1.0.0");
    expect(refundPercentForHours(48, legacy)).toBe(100);
    expect(refundPercentForHours(24, legacy)).toBe(50);
    expect(refundPercentForHours(23.99, legacy)).toBe(0);
  });

  it("evaluates an existing booking with the version it accepted", () => {
    const accepted = { policy_version: "1.0.0" };
    const policy = policyForSnapshot(accepted);
    expect(policy.version).toBe("1.0.0");
    // 20 h before start: legacy → 0 %, new ladder → 100 %.
    expect(refundPercentForHours(20, policy)).toBe(0);
    expect(refundPercentForHours(20)).toBe(100);
  });

  it("falls back to the legacy ladder — never the newest — without a snapshot", () => {
    expect(policyForSnapshot(null).version).toBe(LEGACY_CANCELLATION_POLICY_VERSION);
    expect(policyForSnapshot({}).version).toBe(LEGACY_CANCELLATION_POLICY_VERSION);
    expect(policyForVersion("9.9.9").version).toBe(LEGACY_CANCELLATION_POLICY_VERSION);
  });

  it("freezes the accepted terms in the booking snapshot", () => {
    const snap = cancellationPolicySnapshot() as {
      policy_version: string;
      tiers: { key: string; min_hours_before_start: number; bound_exclusive: boolean; refund_percent: number }[];
    };
    expect(snap.policy_version).toBe("2.0.0");
    expect(snap.tiers).toEqual([
      { key: "full", min_hours_before_start: 18, bound_exclusive: true, refund_percent: 100 },
      { key: "partial", min_hours_before_start: 8, bound_exclusive: false, refund_percent: 50 },
      { key: "none", min_hours_before_start: 0, bound_exclusive: false, refund_percent: 0 },
    ]);
    // A snapshot round-trips to the exact ladder it recorded.
    expect(policyForSnapshot(snap).version).toBe("2.0.0");
  });
});

describe("customer-facing cut-offs", () => {
  it("exposes the exact free-cancellation and full-fee instants", () => {
    const start = new Date("2026-08-10T07:00:00Z");
    const c = cancellationCutoffs(start)!;
    expect(c.freeUntil.toISOString()).toBe(new Date(start.getTime() - 18 * H).toISOString());
    expect(c.fullFeeFrom.toISOString()).toBe(new Date(start.getTime() - 8 * H).toISOString());
    expect(c.partialUntil.toISOString()).toBe(c.fullFeeFrom.toISOString());
  });

  it("cut-offs agree with the ladder at their own boundaries", () => {
    const start = new Date("2026-08-10T07:00:00Z");
    const c = cancellationCutoffs(start)!;
    expect(tierForBooking(start, new Date(c.freeUntil.getTime() - 1)).refundPercent).toBe(100);
    expect(tierForBooking(start, c.freeUntil).refundPercent).toBe(50);
    expect(tierForBooking(start, c.fullFeeFrom).refundPercent).toBe(50);
    expect(tierForBooking(start, new Date(c.fullFeeFrom.getTime() + 1)).refundPercent).toBe(0);
  });

  it("deadlines list the ladder in order", () => {
    const start = new Date("2026-08-10T07:00:00Z");
    const rows = cancellationDeadlines(start);
    expect(rows.map((r) => r.tier.key)).toEqual(["full", "partial", "none"]);
    expect(rows[0].until!.toISOString()).toBe(new Date(start.getTime() - 18 * H).toISOString());
    expect(rows[2].until).toBeNull();
  });
});
