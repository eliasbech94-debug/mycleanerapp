/**
 * Coordinated activation of the 18/8 ladder (v2.0.0).
 *
 * Guards the exact boundary at ACTIVATION_AT, the server-side kill switch,
 * and the rule that an existing booking is NEVER re-evaluated with a policy
 * chosen at cancellation time.
 */
import { describe, it, expect } from "vitest";
import {
  CANCELLATION_POLICY_V2_ACTIVATION_AT,
  CANCELLATION_POLICY_V2_ACTIVATION_MS,
  LEGACY_CANCELLATION_POLICY_VERSION,
  bookingStartInstant,
  cancellationPolicySnapshot,
  hoursUntilServiceStart,
  policyAt,
  policyForSnapshot,
  refundPercentForHours,
} from "./cancellationPolicy";

const T = CANCELLATION_POLICY_V2_ACTIVATION_MS;
const H = 3_600_000;

describe("activation instant", () => {
  it("is the approved UTC instant", () => {
    expect(CANCELLATION_POLICY_V2_ACTIVATION_AT).toBe("2026-08-03T06:00:00.000Z");
    expect(new Date(T).toISOString()).toBe("2026-08-03T06:00:00.000Z");
  });

  it("selects v1 one millisecond before T", () => {
    expect(policyAt(T - 1, true).version).toBe("1.0.0");
  });

  it("selects v2 exactly at T", () => {
    expect(policyAt(T, true).version).toBe("2.0.0");
  });

  it("selects v2 one millisecond after T", () => {
    expect(policyAt(T + 1, true).version).toBe("2.0.0");
  });

  it("selects v1 long before T and v2 long after T", () => {
    expect(policyAt(T - 30 * 24 * H, true).version).toBe("1.0.0");
    expect(policyAt(T + 365 * 24 * H, true).version).toBe("2.0.0");
  });

  it("fails safe to v1 on an unparseable instant", () => {
    expect(policyAt("not-a-date", true).version).toBe("1.0.0");
    expect(policyAt(Number.NaN, true).version).toBe("1.0.0");
  });

  it("accepts Date, ISO string and epoch ms identically", () => {
    expect(policyAt(new Date(T), true).version).toBe(policyAt(T, true).version);
    expect(policyAt(new Date(T).toISOString(), true).version).toBe(policyAt(T, true).version);
  });
});

describe("kill switch", () => {
  it("flag OFF before T → v1", () => {
    expect(policyAt(T - 1, false).version).toBe("1.0.0");
  });

  it("flag OFF at and after T → v1 (fail-safe)", () => {
    expect(policyAt(T, false).version).toBe("1.0.0");
    expect(policyAt(T + 10 * H, false).version).toBe("1.0.0");
  });

  it("flag ON before T → still v1 (time gate wins)", () => {
    expect(policyAt(T - 1, true).version).toBe("1.0.0");
  });

  it("flag ON at and after T → v2", () => {
    expect(policyAt(T, true).version).toBe("2.0.0");
    expect(policyAt(T + 10 * H, true).version).toBe("2.0.0");
  });
});

describe("snapshot freeze and cancellation", () => {
  it("a booking created before T keeps 48/24 even when cancelled after T", () => {
    const snap = cancellationPolicySnapshot(policyAt(T - 1, true), T - 1);
    expect((snap as { policy_version: string }).policy_version).toBe("1.0.0");

    // Cancelled after T, 20 h before start: v1 → 0 %, v2 would have been 100 %.
    const policy = policyForSnapshot(snap);
    expect(policy.version).toBe("1.0.0");
    expect(refundPercentForHours(20, policy)).toBe(0);
    expect(refundPercentForHours(20, policyAt(T + H, true))).toBe(100);
  });

  it("a booking created after T uses 18/8", () => {
    const snap = cancellationPolicySnapshot(policyAt(T + 1, true), T + 1);
    const policy = policyForSnapshot(snap);
    expect(policy.version).toBe("2.0.0");
    expect(refundPercentForHours(20, policy)).toBe(100);
    expect(refundPercentForHours(12, policy)).toBe(50);
    expect(refundPercentForHours(7, policy)).toBe(0);
  });

  it("an unknown snapshot version falls back to legacy, never the newest", () => {
    expect(policyForSnapshot({ policy_version: "9.9.9" }).version)
      .toBe(LEGACY_CANCELLATION_POLICY_VERSION);
    expect(policyForSnapshot({ policy_version: 42 }).version)
      .toBe(LEGACY_CANCELLATION_POLICY_VERSION);
  });

  it("a missing snapshot falls back to legacy", () => {
    expect(policyForSnapshot(null).version).toBe("1.0.0");
    expect(policyForSnapshot(undefined).version).toBe("1.0.0");
    expect(policyForSnapshot({}).version).toBe("1.0.0");
  });

  it("records the accepted instant on the snapshot", () => {
    const snap = cancellationPolicySnapshot(policyAt(T, true), T) as { accepted_at: string };
    expect(snap.accepted_at).toBe("2026-08-03T06:00:00.000Z");
  });
});

describe("timezone and DST around activation", () => {
  it("activation is an absolute instant, not a wall-clock time", () => {
    // 2026-08-03 08:00 CEST === 06:00 UTC === T.
    expect(policyAt("2026-08-03T08:00:00+02:00", true).version).toBe("2.0.0");
    expect(policyAt("2026-08-03T07:59:59.999+02:00", true).version).toBe("1.0.0");
    // Same instant expressed in another zone.
    expect(policyAt("2026-08-03T07:00:00+01:00", true).version).toBe("2.0.0");
  });

  it("evaluates a DST-crossing booking with its frozen policy", () => {
    const start = bookingStartInstant("2026-10-25", "09:00", "Europe/Copenhagen")!;
    const snapV1 = policyForSnapshot(cancellationPolicySnapshot(policyAt(T - 1, true), T - 1));
    const hours = hoursUntilServiceStart(start, start.getTime() - 30 * H);
    expect(Math.round(hours)).toBe(30);
    expect(refundPercentForHours(hours, snapV1)).toBe(50); // v1: 24–48 h → 50 %
    expect(refundPercentForHours(hours, policyAt(T, true))).toBe(100); // v2: > 18 h
  });
});
