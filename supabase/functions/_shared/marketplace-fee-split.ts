export interface MarketplaceFeeSplit {
  customerPays: number;
  serviceGross: number;
  customerPlatformFee: number;
  providerPlatformFee: number;
  providerNet: number;
  totalPlatformRevenue: number;
}

/**
 * Reconstructs the commercial split from persisted booking amounts.
 *
 * MyCleaner pricing contract:
 *   customer pays = service gross + customer fee
 *   provider net   = service gross - provider fee
 *   customer fee  = provider fee = configured fee rate of service gross
 *
 * Using both persisted endpoints avoids compounding/rounding drift and keeps
 * historical bookings auditable even if the configured rate changes later.
 */
export function splitMarketplaceAmounts(
  customerPays: number,
  providerNet: number,
): MarketplaceFeeSplit {
  if (!Number.isInteger(customerPays) || !Number.isInteger(providerNet)) {
    throw new Error("amounts_must_be_minor_unit_integers");
  }
  if (customerPays < 0 || providerNet < 0 || providerNet > customerPays) {
    throw new Error("invalid_marketplace_amounts");
  }

  const totalPlatformRevenue = customerPays - providerNet;
  const customerPlatformFee = Math.ceil(totalPlatformRevenue / 2);
  const providerPlatformFee = totalPlatformRevenue - customerPlatformFee;
  const serviceGross = customerPays - customerPlatformFee;

  return {
    customerPays,
    serviceGross,
    customerPlatformFee,
    providerPlatformFee,
    providerNet,
    totalPlatformRevenue,
  };
}

export function prorateSplit(
  split: MarketplaceFeeSplit,
  refundedCustomerAmount: number,
): MarketplaceFeeSplit {
  if (!Number.isInteger(refundedCustomerAmount) || refundedCustomerAmount < 0) {
    throw new Error("invalid_refund_amount");
  }
  if (split.customerPays === 0) return split;

  const retained = Math.max(0, split.customerPays - refundedCustomerAmount);
  const ratio = retained / split.customerPays;
  const customerPlatformFee = Math.round(split.customerPlatformFee * ratio);
  const providerPlatformFee = Math.round(split.providerPlatformFee * ratio);
  const serviceGross = Math.round(split.serviceGross * ratio);
  const providerNet = Math.max(0, retained - customerPlatformFee - providerPlatformFee);

  return {
    customerPays: retained,
    serviceGross,
    customerPlatformFee,
    providerPlatformFee,
    providerNet,
    totalPlatformRevenue: customerPlatformFee + providerPlatformFee,
  };
}
