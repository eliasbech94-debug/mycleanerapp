/**
 * MarketplaceStats — intentionally returns null.
 *
 * Placeholder component so the homepage layout supports statistics later
 * without another refactor. Do NOT render invented numbers (customers,
 * providers, bookings, ratings, live activity). When an authoritative RPC
 * or admin-controlled source ships, wire it up here and gate rendering on
 * `data != null` — never fall back to a hardcoded value.
 */
export function MarketplaceStats() {
  return null;
}
