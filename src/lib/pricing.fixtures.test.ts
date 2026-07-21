// Parity suite — every shared fixture must produce identical output from the
// browser/Vitest engine as it does from the Deno/edge engine.
import { describe, it, expect } from "vitest";
import { applyCommission, classifyDemand, computeAdjustment } from "@/lib/pricing";
import {
  COMMISSION_FIXTURES,
  ADJUSTMENT_FIXTURES,
  BAND_FIXTURES,
  THRESHOLDS,
} from "@/lib/pricing.fixtures";

describe("shared pricing fixtures — Vitest parity", () => {
  for (const f of COMMISSION_FIXTURES) {
    it(`commission: ${f.name}`, () => {
      const r = applyCommission(f.subtotal_minor, f.commission_bps);
      expect(r.customerTotalMinor).toBe(f.expected.customer_total_minor);
      expect(r.providerNetMinor).toBe(f.expected.provider_net_minor);
      expect(r.platformFeeMinor).toBe(f.expected.platform_fee_minor);
      expect(r.platformFeeMinor).toBe(r.customerTotalMinor - r.providerNetMinor);
    });
  }

  for (const b of BAND_FIXTURES) {
    it(`band: ${b.ratio_bps} → ${b.band}`, () => {
      expect(classifyDemand(b.ratio_bps, THRESHOLDS)).toBe(b.band);
    });
  }

  for (const a of ADJUSTMENT_FIXTURES) {
    it(`adjustment: ${a.name}`, () => {
      const r = computeAdjustment(a.input);
      expect(r.total_adjustment_bps).toBe(a.expected_total_adjustment_bps);
    });
  }
});
