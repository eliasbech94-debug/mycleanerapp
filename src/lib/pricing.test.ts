import { describe, it, expect } from "vitest";
import {
  applyCommission, classifyDemand, clampRate, computeAdjustment,
  roundHalfAway, splitCommissionBps,
} from "@/lib/pricing";

describe("pricing engine — deterministic math", () => {
  it("rounds half-away-from-zero on integer minor units", () => {
    expect(roundHalfAway(0)).toBe(0);
    expect(roundHalfAway(0.5)).toBe(1);
    expect(roundHalfAway(-0.5)).toBe(-1);
    expect(roundHalfAway(3333.5)).toBe(3334);
    expect(roundHalfAway(-3333.5)).toBe(-3334);
  });

  it("splits commission preserving total for even and odd bps", () => {
    expect(splitCommissionBps(2800)).toEqual({ customerHalfBps: 1400, providerHalfBps: 1400 });
    const odd = splitCommissionBps(2801);
    expect(odd.customerHalfBps + odd.providerHalfBps).toBe(2801);
    expect(odd).toEqual({ customerHalfBps: 1401, providerHalfBps: 1400 });
    expect(() => splitCommissionBps(-1)).toThrow();
    expect(() => splitCommissionBps(2.5)).toThrow();
  });

  it("FIXTURE — rate 30000 minor, 2h, 2800 bps: 68400 / 51600 / 16800", () => {
    const r = applyCommission(30000 * 2, 2800);
    expect(r.subtotalMinor).toBe(60000);
    expect(r.customerTotalMinor).toBe(68400);
    expect(r.providerNetMinor).toBe(51600);
    expect(r.platformFeeMinor).toBe(16800);
    expect(r.customerHalfBps).toBe(1400);
    expect(r.providerHalfBps).toBe(1400);
  });

  it("commission difference invariant holds for odd bps", () => {
    const r = applyCommission(60000, 2801);
    expect(r.platformFeeMinor).toBe(r.customerTotalMinor - r.providerNetMinor);
  });

  it("classifies demand deterministically on finite thresholds", () => {
    const t = { very_low_max_bps: 2500, low_max_bps: 6000, normal_max_bps: 11000, high_max_bps: 17500 };
    expect(classifyDemand(0, t)).toBe("very_low");
    expect(classifyDemand(2500, t)).toBe("very_low");
    expect(classifyDemand(2501, t)).toBe("low");
    expect(classifyDemand(11000, t)).toBe("normal");
    expect(classifyDemand(11001, t)).toBe("high");
    expect(classifyDemand(17500, t)).toBe("high");
    expect(classifyDemand(17501, t)).toBe("very_high");
    expect(classifyDemand(999999, t)).toBe("very_high");
    expect(() =>
      classifyDemand(0, { very_low_max_bps: 100, low_max_bps: 100, normal_max_bps: 200, high_max_bps: 300 })
    ).toThrow();
  });

  it("stacks adjustments: urgent replaces same-day; holiday replaces weekend", () => {
    const r = computeAdjustment({
      demand_band_bps: 500,
      weekend_bps: 300, holiday_bps: 800, same_day_bps: 400, urgent_bps: 900,
      is_urgent: true, is_same_day: true, is_holiday: true, is_weekend: true,
      max_total_adjustment_bps: 5000,
      allow_decrease: true, allow_increase: true,
      max_decrease_bps: 5000, max_increase_bps: 5000,
    });
    expect(r).toEqual({ weekend_bps: 0, holiday_bps: 800, same_day_bps: 0, urgent_bps: 900, total_adjustment_bps: 2200 });
  });

  it("applies hard cap and provider caps deterministically", () => {
    const capped = computeAdjustment({
      demand_band_bps: 4000, weekend_bps: 2000, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
      is_urgent: false, is_same_day: false, is_holiday: false, is_weekend: true,
      max_total_adjustment_bps: 3000,
      allow_decrease: true, allow_increase: true,
      max_decrease_bps: 10000, max_increase_bps: 10000,
    });
    expect(capped.total_adjustment_bps).toBe(3000);

    const noIncrease = computeAdjustment({
      demand_band_bps: 1500, weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
      is_urgent: false, is_same_day: false, is_holiday: false, is_weekend: false,
      max_total_adjustment_bps: 5000,
      allow_decrease: true, allow_increase: false,
      max_decrease_bps: 5000, max_increase_bps: 5000,
    });
    expect(noIncrease.total_adjustment_bps).toBe(0);
  });

  it("clamps rate against country floor and provider bounds", () => {
    expect(clampRate(20000, 15000, 40000, 10000)).toBe(20000);
    expect(clampRate(5000, 15000, 40000, 10000)).toBe(15000);
    expect(clampRate(5000, 8000, 40000, 12000)).toBe(12000);
    expect(clampRate(99999, 15000, 40000, 10000)).toBe(40000);
  });
});
