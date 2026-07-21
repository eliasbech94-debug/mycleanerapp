// Parity suite (Deno) — mirrors src/lib/pricing.fixtures.test.ts. Both engines
// consume the identical fixtures from ./pricing.fixtures.ts.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyCommission, classifyDemand, computeAdjustment } from "./pricing.ts";
import {
  COMMISSION_FIXTURES,
  ADJUSTMENT_FIXTURES,
  BAND_FIXTURES,
  THRESHOLDS,
} from "./pricing.fixtures.ts";

for (const f of COMMISSION_FIXTURES) {
  Deno.test(`commission parity: ${f.name}`, () => {
    const r = applyCommission(f.subtotal_minor, f.commission_bps);
    assertEquals(r.customerTotalMinor, f.expected.customer_total_minor);
    assertEquals(r.providerNetMinor, f.expected.provider_net_minor);
    assertEquals(r.platformFeeMinor, f.expected.platform_fee_minor);
    assertEquals(r.platformFeeMinor, r.customerTotalMinor - r.providerNetMinor);
  });
}

for (const b of BAND_FIXTURES) {
  Deno.test(`band parity: ${b.ratio_bps} → ${b.band}`, () => {
    assertEquals(classifyDemand(b.ratio_bps, THRESHOLDS), b.band);
  });
}

for (const a of ADJUSTMENT_FIXTURES) {
  Deno.test(`adjustment parity: ${a.name}`, () => {
    const r = computeAdjustment(a.input);
    assertEquals(r.total_adjustment_bps, a.expected_total_adjustment_bps);
  });
}
