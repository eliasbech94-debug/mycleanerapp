import { lazy, Suspense } from "react";
import { useHomeAudience, type HomeAudience } from "./useHomeAudience";

// Below-the-fold sections are code-split to keep initial JS on the homepage
// small. Each section is reusable and driven by the Localization Engine.
const HowItWorksSection = lazy(() => import("./HowItWorksSection").then((m) => ({ default: m.HowItWorksSection })));
const CustomerReviewsSection = lazy(() => import("./CustomerReviewsSection").then((m) => ({ default: m.CustomerReviewsSection })));
const CampaignSection = lazy(() => import("./CampaignSection").then((m) => ({ default: m.CampaignSection })));
const DownloadAppSection = lazy(() => import("./DownloadAppSection").then((m) => ({ default: m.DownloadAppSection })));
const FAQSection = lazy(() => import("./FAQSection").then((m) => ({ default: m.FAQSection })));
const ReturningCustomerSection = lazy(() => import("./ReturningCustomerSection").then((m) => ({ default: m.ReturningCustomerSection })));
const ProviderShortcutsSection = lazy(() => import("./ProviderShortcutsSection").then((m) => ({ default: m.ProviderShortcutsSection })));

/**
 * Section registry — one atom per marketplace-homepage section, tagged
 * with the audiences it should render for. This is the Experience Engine
 * hook point: swap `visibleFor` with a config-driven predicate to make
 * any section CMS/flag-driven without touching this file.
 */
type SectionId =
  | "returning_customer"
  | "provider_shortcuts"
  | "how_it_works"
  | "reviews"
  | "campaign"
  | "download_app"
  | "faq";

type Section = {
  id: SectionId;
  Component: React.LazyExoticComponent<React.ComponentType>;
  visibleFor: HomeAudience[];
};

const SECTIONS: Section[] = [
  { id: "returning_customer", Component: ReturningCustomerSection, visibleFor: ["customer"] },
  { id: "provider_shortcuts", Component: ProviderShortcutsSection, visibleFor: ["provider"] },
  { id: "how_it_works", Component: HowItWorksSection, visibleFor: ["guest", "customer", "provider"] },
  { id: "reviews", Component: CustomerReviewsSection, visibleFor: ["guest", "customer"] },
  { id: "campaign", Component: CampaignSection, visibleFor: ["guest"] },
  { id: "download_app", Component: DownloadAppSection, visibleFor: ["guest", "customer"] },
  { id: "faq", Component: FAQSection, visibleFor: ["guest", "customer"] },
];

/**
 * `slot` splits sections that belong ABOVE the primary cleaner grid
 * (personalized welcomes) from everything else that renders BELOW it.
 */
export function HomeSections({ slot }: { slot: "top" | "bottom" }) {
  const { audience } = useHomeAudience();
  const isTop = slot === "top";
  const list = SECTIONS.filter((s) => {
    const topSlot = s.id === "returning_customer" || s.id === "provider_shortcuts";
    if (isTop !== topSlot) return false;
    return s.visibleFor.includes(audience);
  });

  if (!list.length) return null;

  return (
    <Suspense fallback={<div className="h-24" aria-hidden="true" />}>
      {list.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </Suspense>
  );
}
