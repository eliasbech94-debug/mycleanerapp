// Deno test file (run with `deno test`). Verifies deterministic math + the
// fixture required by Phase 1 approval.
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyCommission,
  classifyDemand,
  clampRate,
  computeAdjustment,
  roundHalfAway,
  splitCommissionBps,
} from "./pricing.ts";

Deno.test("roundHalfAway matches sql round_half_away semantics", () => {
  assertEquals(roundHalfAway(0), 0);
  assertEquals(roundHalfAway(0.5), 1);
  assertEquals(roundHalfAway(-0.5), -1);
  assertEquals(roundHalfAway(3333.5), 3334);
  assertEquals(roundHalfAway(-3333.5), -3334);
});

Deno.test("splitCommissionBps preserves total for even + odd values", () => {
  const a = splitCommissionBps(2800);
  assertEquals(a, { customerHalfBps: 1400, providerHalfBps: 1400 });
  const b = splitCommissionBps(2801);
  assertEquals(b.customerHalfBps + b.providerHalfBps, 2801);
  assertEquals(b, { customerHalfBps: 1401, providerHalfBps: 1400 });
  assertThrows(() => splitCommissionBps(-1));
  assertThrows(() => splitCommissionBps(2.5));
});

Deno.test("FIXTURE: rate 30000, 2h, commission 2800bps", () => {
  const subtotalMinor = 30000 * 2; // 60000
  const r = applyCommission(subtotalMinor, 2800);
  assertEquals(r.subtotalMinor, 60000);
  assertEquals(r.customerTotalMinor, 68400);
  assertEquals(r.providerNetMinor, 51600);
  assertEquals(r.platformFeeMinor, 16800);
  assertEquals(r.customerHalfBps, 1400);
  assertEquals(r.providerHalfBps, 1400);
});

Deno.test("commission never exceeds difference-invariant for odd bps", () => {
  const r = applyCommission(60000, 2801);
  assertEquals(r.platformFeeMinor, r.customerTotalMinor - r.providerNetMinor);
});

Deno.test("classifyDemand is deterministic on finite thresholds", () => {
  const t = { very_low_max_bps: 2500, low_max_bps: 6000, normal_max_bps: 11000, high_max_bps: 17500 };
  assertEquals(classifyDemand(0, t), "very_low");
  assertEquals(classifyDemand(2500, t), "very_low");
  assertEquals(classifyDemand(2501, t), "low");
  assertEquals(classifyDemand(11000, t), "normal");
  assertEquals(classifyDemand(11001, t), "high");
  assertEquals(classifyDemand(17500, t), "high");
  assertEquals(classifyDemand(17501, t), "very_high");
  assertEquals(classifyDemand(999999, t), "very_high");
  assertThrows(() =>
    classifyDemand(0, { very_low_max_bps: 100, low_max_bps: 100, normal_max_bps: 200, high_max_bps: 300 })
  );
});

Deno.test("computeAdjustment: urgent replaces same-day; holiday replaces weekend", () => {
  const base = {
    demand_band_bps: 500,
    weekend_bps: 300, holiday_bps: 800, same_day_bps: 400, urgent_bps: 900,
    max_total_adjustment_bps: 5000,
    allow_decrease: true, allow_increase: true,
    max_decrease_bps: 5000, max_increase_bps: 5000,
  };
  const r1 = computeAdjustment({ ...base, is_urgent: true, is_same_day: true, is_holiday: true, is_weekend: true });
  // urgent (900) + holiday (800) + demand 500 = 2200; weekend and same-day suppressed
  assertEquals(r1.urgent_bps, 900);
  assertEquals(r1.same_day_bps, 0);
  assertEquals(r1.holiday_bps, 800);
  assertEquals(r1.weekend_bps, 0);
  assertEquals(r1.total_adjustment_bps, 2200);
});

Deno.test("computeAdjustment: hard cap and provider caps clamp deterministically", () => {
  const capped = computeAdjustment({
    demand_band_bps: 4000,
    weekend_bps: 2000, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
    is_urgent: false, is_same_day: false, is_holiday: false, is_weekend: true,
    max_total_adjustment_bps: 3000,
    allow_decrease: true, allow_increase: true,
    max_decrease_bps: 10000, max_increase_bps: 10000,
  });
  assertEquals(capped.total_adjustment_bps, 3000);

  const providerCap = computeAdjustment({
    demand_band_bps: 2500,
    weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
    is_urgent: false, is_same_day: false, is_holiday: false, is_weekend: false,
    max_total_adjustment_bps: 5000,
    allow_decrease: true, allow_increase: true,
    max_decrease_bps: 5000, max_increase_bps: 1000,
  });
  assertEquals(providerCap.total_adjustment_bps, 1000);

  const noIncrease = computeAdjustment({
    demand_band_bps: 1500,
    weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
    is_urgent: false, is_same_day: false, is_holiday: false, is_weekend: false,
    max_total_adjustment_bps: 5000,
    allow_decrease: true, allow_increase: false,
    max_decrease_bps: 5000, max_increase_bps: 5000,
  });
  assertEquals(noIncrease.total_adjustment_bps, 0);
});

Deno.test("clampRate: provider bounds override, country floor wins over provider min", () => {
  assertEquals(clampRate(20000, 15000, 40000, 10000), 20000);
  assertEquals(clampRate(5000, 15000, 40000, 10000), 15000);   // provider min
  assertEquals(clampRate(5000, 8000, 40000, 12000), 12000);    // country floor beats provider min
  assertEquals(clampRate(99999, 15000, 40000, 10000), 40000);
});
