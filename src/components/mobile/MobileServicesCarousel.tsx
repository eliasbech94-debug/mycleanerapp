/**
 * MobileServicesCarousel — mobile-only horizontal swipe carousel that
 * replaces the desktop `ServiceCategoryGrid` grid on <768px.
 *
 * Mirrors the exact same tile set (cleaning-only, existing marketplace
 * destinations) so behaviour and routing stay identical; only presentation
 * changes to a native scroll-snap row.
 *
 * Design contract:
 *  - Uses `overflow-x-auto` + `scroll-snap-type: x mandatory` so browsers
 *    naturally restore scroll position after back navigation without any
 *    global state.
 *  - Scrollbar hidden visually, never functionally.
 *  - Each tile is a 44x44 min tap target.
 *  - No horizontal document overflow — the scroller lives inside a padded
 *    section and clips to the viewport.
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
    case "deep": return "Deep Cleaning";
    case "move": return "Move In/Out";
    case "office": return "Office Cleaning";
    case "custom": return "Custom Service";
    default: return k;
  }
}

export function MobileServicesCarousel() {
  const { t } = useTranslation("marketplace");
  return (
    <section
      className="pt-6"
      aria-labelledby="mobile-services-heading"
      data-testid="mobile-services-carousel"
    >
      <div className="mb-3 flex items-end justify-between gap-3 px-4">
        <h2
          id="mobile-services-heading"
          className="text-[17px] font-semibold text-[hsl(var(--mkt-ink))]"
        >
          {t("categories.heading", "Populære ydelser")}
        </h2>
        <Link
          to="/marketplace?category=cleaning"
          className="tap-target text-[13px] font-semibold text-[hsl(var(--mkt-brand))]"
        >
          {t("categories.view_all", "Se alle")}
        </Link>
      </div>
      <ul
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <style>{`[data-testid="mobile-services-carousel"] ul::-webkit-scrollbar{display:none}`}</style>
        {ITEMS.map(({ key, icon: Icon, sub, featured }) => (
          <li
            key={key}
            className="snap-start shrink-0"
            style={{ width: "min(44vw, 168px)" }}
          >
            <Link
              to={`/marketplace?category=cleaning&sub=${sub}`}
              className={
                "tap-pressable flex h-full min-h-[112px] flex-col items-start justify-between gap-2 rounded-2xl border p-3.5 transition-colors " +
                (featured
                  ? "border-[hsl(var(--mkt-brand))]/40 bg-[hsl(var(--mkt-brand-soft))]"
                  : "border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]")
              }
              style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
            >
              <span
                className={
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl " +
                  (featured
                    ? "bg-white/70 text-[hsl(var(--mkt-brand))]"
                    : "bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]")
                }
              >
                <Icon className="h-5 w-5" aria-hidden strokeWidth={2} />
              </span>
              <span className="text-[13.5px] font-semibold leading-tight text-[hsl(var(--mkt-ink))]">
                {t(`categories.tiles.${key}`, defaultLabel(key))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default MobileServicesCarousel;
