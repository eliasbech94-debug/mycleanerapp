/**
 * Backwards-compatible entry point for the development demo dataset.
 *
 * The dataset itself now lives in `@/data/demo` (fixtures + DEMO_MODE gate).
 * This module keeps the historical export names working for existing
 * imports. Demo data is development/preview only and never reaches
 * production builds.
 */
import type { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";
import { DEMO_MODE, DEMO_PROVIDERS_ALL, isDemoModeEnabled, isDemoProviderSlug } from "@/data/demo";

export { isDemoProviderSlug };

/** True only in development/preview or when the demo flag is explicitly enabled. */
export function isDemoProvidersEnabled(): boolean {
  return isDemoModeEnabled();
}

/** Empty in staging/production; populated only when DEMO_MODE is on. */
export const DEMO_PROVIDERS: MarketplaceProvider[] = DEMO_MODE ? DEMO_PROVIDERS_ALL : [];
