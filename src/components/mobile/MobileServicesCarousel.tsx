/**
 * MobileServicesCarousel — horizontal scroll-snap version of the "Popular
 * services" tiles, presented as a native-app carousel.
 *
 * Presentation only. Reuses the same category set and deep links as the
 * desktop `ServiceCategoryGrid` (cleaning-only, per platform constitution).
 * No new data source. Works without JS: CSS scroll-snap does the heavy
 * lifting; a keyboard-focusable overflow row.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Sparkles, Package, Briefcase, Plus } from "lucide-react";

type Tile = { key: string; icon: typeof Home; sub: string; featured?: boolean };
const ITEMS: readonly Tile[] = [
  { key: "regular", icon: Home, sub: "regular", featured: true },
  { key: "deep", icon: Sparkles, sub: "deep" },
  { key: "move", icon: Package, sub: "move" },
  { key: "office", icon: Briefcase, sub: "office" },
  { key: "custom", icon: Plus, sub: "custom" },
];

function defaultLabel(k: string) {
  switch (k) {
    case "regular": return "Regular Cleaning";
    case "deep":    return "Deep Cleaning";
    case "move":    return "Move In/Out";
    case "office":  return "Office Cleaning";
    case "custom":  return "Custom Service";
    default:        return k;
  }
}

export function MobileServicesCarousel() {
  const { t } = useTranslation("marketplace");
  return (
    <section
      aria-labelledby="mobile-services-heading"
      className="pt-6"
    >
      <div className="mb-3 flex items-end justify-between gap-3 px-4">
        <h2
          id="mobile-services-heading"
          className="text-[17px] font-semibold text-[hsl(var(--mkt-ink))]"
        >
          {t("categories.heading", "Populære services")}
        </h2>
        <Link
          to="/marketplace?category=cleaning"
          className="text-[13px] font-semibold text-[hsl(var(--mkt-brand))]"
        >
          {t("categories.view_all", "Se alle")}
        </Link>
      </div>
      <div
        role="list"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 momentum-scroll"
        style={{ scrollPaddingInline: "16px" }}
      >
        {ITEMS.map(({ key, icon: Icon, sub, featured }) => (
          <Link
            key={key}
            role="listitem"
            to={`/marketplace?category=cleaning&sub=${sub}`}
            className={`tap-target snap-start shrink-0 w-[42vw] max-w-[168px] flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2 ${
              featured
                ? "border-[hsl(var(--mkt-brand))]/40 bg-[hsl(var(--mkt-brand-soft))]"
                : "border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]"
            }`}
            style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
          >
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                featured
                  ? "bg-white text-[hsl(var(--mkt-brand))]"
                  : "bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-[13px] font-semibold leading-tight text-[hsl(var(--mkt-ink))]">
              {t(`categories.tiles.${key}`, defaultLabel(key))}
            </span>
          </Link>
        ))}
        {/* Trailing spacer so the last card can fully snap into view */}
        <span aria-hidden className="shrink-0 w-2" />
      </div>
    </section>
  );
}

export default MobileServicesCarousel;
