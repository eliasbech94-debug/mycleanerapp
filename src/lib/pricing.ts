// Mirror of supabase/functions/_shared/pricing.ts so the browser bundle + vitest
// can exercise the same deterministic math. Keep the two files in lock-step —
// any change here must be applied identically to the edge shared copy.
export type DemandBand = "very_low" | "low" | "normal" | "high" | "very_high";
export type PricingMode = "static" | "dynamic";

export interface BandBps {
  very_low: number; low: number; normal: number; high: number; very_high: number;
}
export interface BandThresholdsBps {
  very_low_max_bps: number;
  low_max_bps: number;
  normal_max_bps: number;
  high_max_bps: number;
}

export function roundHalfAway(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

export function classifyDemand(ratioBps: number, t: BandThresholdsBps): DemandBand {
  if (!(t.very_low_max_bps < t.low_max_bps && t.low_max_bps < t.normal_max_bps && t.normal_max_bps < t.high_max_bps)) {
    throw new Error("band_thresholds must be strictly increasing");
  }
  if (ratioBps <= t.very_low_max_bps) return "very_low";
  if (ratioBps <= t.low_max_bps) return "low";
  if (ratioBps <= t.normal_max_bps) return "normal";
  if (ratioBps <= t.high_max_bps) return "high";
  return "very_high";
}

export function splitCommissionBps(commissionBps: number): { customerHalfBps: number; providerHalfBps: number } {
  if (!Number.isInteger(commissionBps) || commissionBps < 0) {
    throw new Error("commission_bps must be a non-negative integer");
  }
  const customerHalfBps = Math.ceil(commissionBps / 2);
  const providerHalfBps = Math.floor(commissionBps / 2);
  if (customerHalfBps + providerHalfBps !== commissionBps) throw new Error("commission split invariant violated");
  return { customerHalfBps, providerHalfBps };
}

export interface AdjustmentInputs {
  demand_band_bps: number;
  weekend_bps: number; holiday_bps: number; same_day_bps: number; urgent_bps: number;
  is_weekend: boolean; is_holiday: boolean; is_same_day: boolean; is_urgent: boolean;
  max_total_adjustment_bps: number;
  allow_decrease: boolean; allow_increase: boolean;
  max_decrease_bps: number; max_increase_bps: number;
}
export interface AdjustmentBreakdown {
  weekend_bps: number; holiday_bps: number; same_day_bps: number; urgent_bps: number;
  total_adjustment_bps: number;
}

export function computeAdjustment(a: AdjustmentInputs): AdjustmentBreakdown {
  const urgent = a.is_urgent ? a.urgent_bps : 0;
  const sameDay = !a.is_urgent && a.is_same_day ? a.same_day_bps : 0;
  const holiday = a.is_holiday ? a.holiday_bps : 0;
  const weekend = !a.is_holiday && a.is_weekend ? a.weekend_bps : 0;
  let total = a.demand_band_bps + urgent + sameDay + holiday + weekend;
  const hardCap = Math.max(0, a.max_total_adjustment_bps);
  if (total > hardCap) total = hardCap;
  if (total < -hardCap) total = -hardCap;
  if (!a.allow_increase && total > 0) total = 0;
  if (!a.allow_decrease && total < 0) total = 0;
  if (total > a.max_increase_bps) total = a.max_increase_bps;
  if (total < -a.max_decrease_bps) total = -a.max_decrease_bps;
  return { weekend_bps: weekend, holiday_bps: holiday, same_day_bps: sameDay, urgent_bps: urgent, total_adjustment_bps: total };
}

export interface CommissionResult {
  subtotalMinor: number;
  customerTotalMinor: number;
  providerNetMinor: number;
  platformFeeMinor: number;
  customerHalfBps: number;
  providerHalfBps: number;
}

/**
 * Split-fee commission (verified against BookingFlow.tsx + payment-create-intent).
 * customer_pays = round(base * (10000 + ceil(commission/2)) / 10000)
 * provider_gets = round(base * (10000 - floor(commission/2)) / 10000)
 * platform_fee  = customer_pays - provider_gets
 */
export function applyCommission(subtotalMinor: number, commissionBps: number): CommissionResult {
  if (!Number.isInteger(subtotalMinor) || subtotalMinor < 0) {
    throw new Error("subtotal_minor must be a non-negative integer");
  }
  const { customerHalfBps, providerHalfBps } = splitCommissionBps(commissionBps);
  const customerTotalMinor = roundHalfAway(subtotalMinor * (10000 + customerHalfBps) / 10000);
  const providerNetMinor = roundHalfAway(subtotalMinor * (10000 - providerHalfBps) / 10000);
  const platformFeeMinor = customerTotalMinor - providerNetMinor;
  return { subtotalMinor, customerTotalMinor, providerNetMinor, platformFeeMinor, customerHalfBps, providerHalfBps };
}

export function clampRate(adjustedMinor: number, providerMinMinor: number, providerMaxMinor: number, floorMinor: number): number {
  const floor = Math.max(providerMinMinor, floorMinor);
  if (adjustedMinor < floor) return floor;
  if (adjustedMinor > providerMaxMinor) return providerMaxMinor;
  return adjustedMinor;
}
