import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useMarketplaceProviders } from "@/hooks/useMarketplaceProviders";
import { MarketplaceSurface } from "@/components/marketplace/MarketplaceSurface";
import { MarketplaceHero } from "@/components/marketplace/MarketplaceHero";
import { ServiceCategoryGrid } from "@/components/marketplace/ServiceCategoryGrid";

import { CleanerResultsList } from "@/components/marketplace/CleanerResultsList";
import { BookingSidebar } from "@/components/marketplace/BookingSidebar";
import { MarketplaceStats } from "@/components/marketplace/MarketplaceStats";
import { CountryConfirmDialog } from "@/components/marketplace/CountryConfirmDialog";
import { HomeSections } from "@/components/marketplace/home/HomeSections";
import { DEMO_PROVIDERS, isDemoProvidersEnabled } from "@/data/demoProviders";
import DemoCollectionRails from "@/components/marketplace/home/DemoCollectionRails";
import { EarlyAccessEmptyState } from "@/components/marketplace/EarlyAccessEmptyState";
import { MarketSeo } from "@/components/seo/MarketSeo";
import { COMPANY, formatCompanyAddress } from "@/config/company";
import { BASE_URL } from "@/i18n/seo";

/** Sitewide entity data for rich results — verified company data only. */
const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MyCleaner",
  legalName: COMPANY.legalName,
  url: BASE_URL,
  identifier: COMPANY.companyNumber,
  address: formatCompanyAddress(),
  sameAs: [COMPANY.registryUrl],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: COMPANY.supportEmail,
      availableLanguage: ["da", "en", "sv", "de", "es"],
    },
  ],
} as const;

/**
 * MyCleaner — public homepage v2.2 (Premium Polish sprint).
 *
 * Layout:
 *   1. Premium editorial hero (Europe-marketplace image, DK/SE/DE/UK/ES
 *      subtly integrated). Text is fully dynamic via the Localization
 *      Engine, never baked into the image.
 *   2. Optional Experience-Engine welcome slot (returning customer /
 *      provider). Renders nothing for guests.
 *   3. Two-column body: Popular services + Top-rated cleaners (real RPC
 *      data) + sticky booking sidebar.
 *   4. Lazy-loaded below-the-fold sections: How it works, Reviews,
 *      Campaign, Download App, FAQ. Each section is a reusable atom
 *      whose visibility is controlled by the Experience Engine.
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
  const providers = hasReal
    ? data
    : (demoEnabled ? DEMO_PROVIDERS : (data ?? null));
  // Production (demo off) with zero real providers → honest Early Access state.
  const showEarlyAccess = !loading && !error && !hasReal && !demoEnabled;

  return (
    <MarketplaceSurface>
      <MarketSeo
        titleKey="seo.home.title"
        descriptionKey="seo.home.description"
        jsonLd={HOME_JSON_LD}
      />
      <MarketplaceHero />


      <HomeSections slot="top" />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-5 pb-8 pt-4 lg:grid-cols-[1fr_360px] lg:gap-8 lg:px-8 lg:pt-6">
        <div className="min-w-0">
          <ServiceCategoryGrid />
          {showEarlyAccess ? (
            <EarlyAccessEmptyState className="mt-4" />
          ) : (
          <CleanerResultsList
            providers={providers}
            loading={loading}
            error={error}
            onRetry={refetch}
            isDemo={!hasReal && demoEnabled && (providers?.length ?? 0) > 0}
            emptyLabel={isNeutral ? undefined : market.label}
          />
          )}
        </div>
        <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
          <BookingSidebar />
        </div>
      </div>

      <DemoCollectionRails primarySlugs={(providers ?? []).slice(0, 4).map((p) => p.provider_slug)} />

      <MarketplaceStats />
      <HomeSections slot="bottom" />

      <CountryConfirmDialog />
    </MarketplaceSurface>
  );
}
