// Shared parity fixtures — the ONE source of truth for pricing math tests.
// Imported by both supabase/functions/_shared/pricing.test.ts (Deno/edge) and
// src/lib/pricing.test.ts (Vitest/browser). The SQL/edge result is the
// authoritative amount charged. The browser copy must produce identical
// outputs for every scenario below; any divergence fails CI.
//
// Approved commercial model (split-fee, verified against BookingFlow.tsx and
// payment-create-intent):
//   customer_half_bps = ceil(commission_bps / 2)
//   provider_half_bps = floor(commission_bps / 2)
//   customer_total    = round_half_away(subtotal * (10000 + customer_half_bps) / 10000)
//   provider_net      = round_half_away(subtotal * (10000 - provider_half_bps) / 10000)
//   platform_fee      = customer_total - provider_net

export interface CommissionFixture {
  name: string;
  subtotal_minor: number;
  commission_bps: number;
  expected: { customer_total_minor: number; provider_net_minor: number; platform_fee_minor: number };
}

export const COMMISSION_FIXTURES: CommissionFixture[] = [
  { name: "canonical DK cleaning 2h @ 300.00 minor, 28%bps",
    subtotal_minor: 60000, commission_bps: 2800,
    expected: { customer_total_minor: 68400, provider_net_minor: 51600, platform_fee_minor: 16800 } },
  { name: "odd bps (2801) — customer pays the extra half",
    subtotal_minor: 60000, commission_bps: 2801,
    expected: { customer_total_minor: 68403, provider_net_minor: 51600, platform_fee_minor: 16803 } },
  { name: "even bps small (1000)",
    subtotal_minor: 100000, commission_bps: 1000,
    expected: { customer_total_minor: 105000, provider_net_minor: 95000, platform_fee_minor: 10000 } },
  { name: "zero commission passes through",
    subtotal_minor: 50000, commission_bps: 0,
    expected: { customer_total_minor: 50000, provider_net_minor: 50000, platform_fee_minor: 0 } },
  { name: "fractional hours (2.5h @ 30000)",
    subtotal_minor: 75000, commission_bps: 2800,
    expected: { customer_total_minor: 85500, provider_net_minor: 64500, platform_fee_minor: 21000 } },
  { name: "tie-round half-away-from-zero (1 minor, 1bp)",
    subtotal_minor: 1, commission_bps: 1,
    expected: { customer_total_minor: 1, provider_net_minor: 1, platform_fee_minor: 0 } },
];

// Band-boundary fixtures — deterministic classifier.
export const THRESHOLDS = {
  very_low_max_bps: 2500,
  low_max_bps: 5000,
  normal_max_bps: 7500,
  high_max_bps: 10000,
} as const;

export const BAND_FIXTURES: { ratio_bps: number; band: "very_low"|"low"|"normal"|"high"|"very_high" }[] = [
  { ratio_bps: 0,     band: "very_low" },
  { ratio_bps: 2500,  band: "very_low" },   // boundary — inclusive of lower band
  { ratio_bps: 2501,  band: "low" },
  { ratio_bps: 5000,  band: "low" },
  { ratio_bps: 5001,  band: "normal" },
  { ratio_bps: 7500,  band: "normal" },
  { ratio_bps: 7501,  band: "high" },
  { ratio_bps: 10000, band: "high" },
  { ratio_bps: 10001, band: "very_high" }, // open-ended remainder
  { ratio_bps: 999999, band: "very_high" },
];

// Adjustment-stacking fixtures — cover provider caps, country hard cap,
// permission flags, and weekend/holiday/same-day/urgent replacements.
export interface AdjustmentFixture {
  name: string;
  input: {
    demand_band_bps: number;
    weekend_bps: number; holiday_bps: number; same_day_bps: number; urgent_bps: number;
    is_weekend: boolean; is_holiday: boolean; is_same_day: boolean; is_urgent: boolean;
    max_total_adjustment_bps: number;
    allow_decrease: boolean; allow_increase: boolean;
    max_decrease_bps: number; max_increase_bps: number;
  };
  expected_total_adjustment_bps: number;
}

export const ADJUSTMENT_FIXTURES: AdjustmentFixture[] = [
  { name: "no surcharges, normal demand, dynamic disabled path",
    input: { demand_band_bps: 0, weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
             is_weekend: false, is_holiday: false, is_same_day: false, is_urgent: false,
             max_total_adjustment_bps: 3000, allow_decrease: true, allow_increase: true,
             max_decrease_bps: 3000, max_increase_bps: 3000 },
    expected_total_adjustment_bps: 0 },
  { name: "provider forbids increase, high demand collapses to zero",
    input: { demand_band_bps: 500, weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
             is_weekend: false, is_holiday: false, is_same_day: false, is_urgent: false,
             max_total_adjustment_bps: 3000, allow_decrease: true, allow_increase: false,
             max_decrease_bps: 3000, max_increase_bps: 0 },
    expected_total_adjustment_bps: 0 },
  { name: "provider forbids decrease, low demand collapses to zero",
    input: { demand_band_bps: -500, weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0,
             is_weekend: false, is_holiday: false, is_same_day: false, is_urgent: false,
             max_total_adjustment_bps: 3000, allow_decrease: false, allow_increase: true,
             max_decrease_bps: 0, max_increase_bps: 3000 },
    expected_total_adjustment_bps: 0 },
];
