import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useMarketplaceProviders } from "@/hooks/useMarketplaceProviders";
import { MarketplaceSurface } from "@/components/marketplace/MarketplaceSurface";
import { MarketplaceHero } from "@/components/marketplace/MarketplaceHero";
import { ServiceCategoryGrid } from "@/components/marketplace/ServiceCategoryGrid";
import { CleanerResultsList } from "@/components/marketplace/CleanerResultsList";
import { BookingSidebar } from "@/components/marketplace/BookingSidebar";
import { MarketplaceStats } from "@/components/marketplace/MarketplaceStats";
import { CountryConfirmDialog } from "@/components/marketplace/CountryConfirmDialog";
import { DEMO_PROVIDERS, isDemoProvidersEnabled } from "@/data/demoProviders";

/**
 * MyCleaner — public homepage v2.1.
 *
 * Reference-matched layout: full-bleed hero + horizontal search, then a
 * two-column body with Popular services + Top-rated cleaners on the left
 * and a sticky "Your booking" / "Why choose" sidebar on the right.
 *
 * Provider results come from the authoritative `search_marketplace_providers_v1`
 * RPC. Demo providers are shown ONLY when demo mode is enabled (dev builds or
 * `VITE_ENABLE_DEMO_PROVIDERS=true`). In staging and production, an RPC failure
 * shows an error state with a retry button — never invented cleaners.
 */
export default function Index() {
  const { market, isNeutral } = useActiveMarket();
  const { data, loading, error, refetch } = useMarketplaceProviders(
    {
      countryCode: isNeutral ? null : market.code,
      serviceCategory: "cleaning",
      sort: "score",
      limit: 6,
    },
    { realtime: true },
  );

  const demoEnabled = isDemoProvidersEnabled();
  const hasReal = !loading && !error && data && data.length > 0;
  // In demo mode only, backfill the row when there are no real results yet so
  // designers can review the layout. Otherwise pass real data (or null on error)
  // straight through and let CleanerResultsList render empty/error states.
  const providers = hasReal
    ? data
    : (demoEnabled ? DEMO_PROVIDERS : (data ?? null));

  return (
    <MarketplaceSurface>
      <MarketplaceHero />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-5 pb-16 lg:grid-cols-[1fr_360px] lg:gap-10 lg:px-8">
        <div className="min-w-0">
          <ServiceCategoryGrid />
          <CleanerResultsList
            providers={providers}
            loading={loading}
            error={error}
            onRetry={refetch}
            isDemo={!hasReal && demoEnabled && (providers?.length ?? 0) > 0}
            emptyLabel={isNeutral ? undefined : market.label}
          />
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start lg:pt-10">
          <BookingSidebar />
        </div>
      </div>

      <MarketplaceStats />
      <CountryConfirmDialog />
    </MarketplaceSurface>
  );
}
