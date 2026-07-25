import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useMarketplaceProviders } from "@/hooks/useMarketplaceProviders";
import { MarketplaceSurface } from "@/components/marketplace/MarketplaceSurface";
import { MarketplaceHero } from "@/components/marketplace/MarketplaceHero";
import { ServiceCategoryGrid } from "@/components/marketplace/ServiceCategoryGrid";
import { CleanerResultsList } from "@/components/marketplace/CleanerResultsList";
import { BookingSidebar } from "@/components/marketplace/BookingSidebar";
import { MarketplaceStats } from "@/components/marketplace/MarketplaceStats";
import { CountryConfirmDialog } from "@/components/marketplace/CountryConfirmDialog";
import { DEMO_PROVIDERS } from "@/data/demoProviders";

/**
 * MyCleaner — public homepage v2.1.
 *
 * Reference-matched layout: full-bleed hero + horizontal search, then a
 * two-column body with Popular services + Top-rated cleaners on the left
 * and a sticky "Your booking" / "Why choose" sidebar on the right.
 * Stats stay hidden until a real source exists.
 */
export default function Index() {
  const { market, isNeutral } = useActiveMarket();
  const { data, loading } = useMarketplaceProviders(
    {
      countryCode: isNeutral ? null : market.code,
      serviceCategory: "cleaning",
      sort: "score",
      limit: 6,
    },
    { realtime: true },
  );

  const hasReal = !loading && data && data.length > 0;
  const providers = hasReal ? data : DEMO_PROVIDERS;

  return (
    <MarketplaceSurface>
      <MarketplaceHero />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-5 pb-16 lg:grid-cols-[1fr_360px] lg:gap-10 lg:px-8">
        <div className="min-w-0">
          <ServiceCategoryGrid />
          <CleanerResultsList
            providers={providers}
            loading={loading && !hasReal ? false : loading}
            isDemo={!hasReal}
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
