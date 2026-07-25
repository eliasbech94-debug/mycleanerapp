import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useMarketplaceProviders } from "@/hooks/useMarketplaceProviders";
import { MarketplaceSurface } from "@/components/marketplace/MarketplaceSurface";
import { MarketplaceHero } from "@/components/marketplace/MarketplaceHero";
import { ServiceCategoryGrid } from "@/components/marketplace/ServiceCategoryGrid";
import { CleanerResultsList } from "@/components/marketplace/CleanerResultsList";
import { TrustSection } from "@/components/marketplace/TrustSection";
import { MarketplaceStats } from "@/components/marketplace/MarketplaceStats";

/**
 * MyCleaner — public homepage v2.0 (Phase 2A).
 *
 * Scoped light marketplace surface. All authenticated dashboards keep
 * their existing tokens (see index.css / `[data-surface="marketplace"]`).
 * Provider data comes from the shared `useMarketplaceProviders` hook so
 * Homepage, Marketplace and FindCleaner never diverge on query shape.
 * Statistics render nothing until an authoritative source ships.
 */
export default function Index() {
  const { market, isNeutral } = useActiveMarket();
  const { data, loading } = useMarketplaceProviders(
    {
      countryCode: isNeutral ? null : market.code,
      serviceCategory: "cleaning",
      sort: "score",
      limit: 8,
    },
    { realtime: true },
  );

  return (
    <MarketplaceSurface>
      <MarketplaceHero />
      <ServiceCategoryGrid />
      <CleanerResultsList
        providers={data}
        loading={loading}
        emptyLabel={isNeutral ? undefined : market.label}
      />
      <MarketplaceStats />
      <TrustSection />
    </MarketplaceSurface>
  );
}
