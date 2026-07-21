// Re-export of the canonical shared pricing fixtures so the Vitest suite
// consumes the *exact same* data as the Deno/edge suite. Do not fork.
export {
  COMMISSION_FIXTURES,
  ADJUSTMENT_FIXTURES,
  BAND_FIXTURES,
  THRESHOLDS,
  type CommissionFixture,
  type AdjustmentFixture,
} from "../../supabase/functions/_shared/pricing.fixtures";
