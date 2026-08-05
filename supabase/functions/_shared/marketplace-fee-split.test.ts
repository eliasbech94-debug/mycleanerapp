import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prorateSplit, splitMarketplaceAmounts } from "./marketplace-fee-split.ts";

Deno.test("splits customer and provider fees equally", () => {
  // Base service 1,000.00; customer pays +14%, provider receives -14%.
  assertEquals(splitMarketplaceAmounts(114000, 86000), {
    customerPays: 114000,
    serviceGross: 100000,
    customerPlatformFee: 14000,
    providerPlatformFee: 14000,
    providerNet: 86000,
    totalPlatformRevenue: 28000,
  });
});

Deno.test("keeps odd rounding deterministic and reconciled", () => {
  const split = splitMarketplaceAmounts(11401, 8599);
  assertEquals(split.customerPlatformFee + split.providerPlatformFee, 2802);
  assertEquals(split.serviceGross + split.customerPlatformFee, split.customerPays);
});

Deno.test("prorates all documents after a partial refund", () => {
  const split = splitMarketplaceAmounts(114000, 86000);
  const adjusted = prorateSplit(split, 57000);
  assertEquals(adjusted.customerPays, 57000);
  assertEquals(adjusted.customerPlatformFee, 7000);
  assertEquals(adjusted.providerPlatformFee, 7000);
  assertEquals(adjusted.serviceGross, 50000);
  assertEquals(adjusted.providerNet, 43000);
});

Deno.test("rejects impossible persisted amounts", () => {
  assertThrows(() => splitMarketplaceAmounts(1000, 1200));
  assertThrows(() => splitMarketplaceAmounts(-1, 0));
  assertThrows(() => splitMarketplaceAmounts(10.5, 5));
});
