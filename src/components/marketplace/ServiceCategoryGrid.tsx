import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Sparkles, Package, Briefcase, AppWindow, Shirt, Plus } from "lucide-react";

/**
 * Popular services row — 7 cleaning-focused tiles matching the reference.
 * Each tile deep-links into /marketplace with `category=cleaning` plus a
 * non-authoritative `sub` hint (Marketplace only consumes `category`).
 */
type Tile = { key: string; icon: typeof Home; sub: string; featured?: boolean };
const ITEMS: readonly Tile[] = [
  { key: "regular",  icon: Home,      sub: "regular",  featured: true },
  { key: "deep",     icon: Sparkles,  sub: "deep" },
  { key: "move",     icon: Package,   sub: "move" },
  { key: "office",   icon: Briefcase, sub: "office" },
  { key: "windows",  icon: AppWindow, sub: "windows" },
  { key: "ironing",  icon: Shirt,     sub: "ironing" },
  { key: "custom",   icon: Plus,      sub: "custom" },
];

export function ServiceCategoryGrid() {
  const { t } = useTranslation("marketplace");
  return (
    <section className="mx-auto max-w-[1400px] px-5 pt-10 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-[18px] font-semibold text-[hsl(var(--mkt-ink))]">
          {t("categories.heading", "Popular services")}
        </h2>
        <Link
          to="/marketplace?category=cleaning"
          className="text-[13.5px] font-semibold text-[hsl(var(--mkt-brand))] hover:underline"
        >
          {t("categories.view_all", "View all")}
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
        {ITEMS.map(({ key, icon: Icon, sub, featured }) => (
          <Link
            key={key}
            to={`/marketplace?category=cleaning&sub=${sub}`}
            className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2 ${
              featured
                ? "border-[hsl(var(--mkt-brand))]/40 bg-[hsl(var(--mkt-brand-soft))]"
                : "border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] hover:border-[hsl(var(--mkt-brand))]/40 hover:bg-[hsl(var(--mkt-brand-soft))]"
            }`}
          >
            <Icon
              className={`h-6 w-6 ${featured ? "text-[hsl(var(--mkt-brand))]" : "text-[hsl(var(--mkt-ink))] group-hover:text-[hsl(var(--mkt-brand))]"}`}
              strokeWidth={2}
            />
            <span className="text-[12.5px] font-semibold leading-tight text-[hsl(var(--mkt-ink))]">
              {t(`categories.tiles.${key}`, defaultLabel(key))}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function defaultLabel(k: string) {
  switch (k) {
    case "regular": return "Regular Cleaning";
    case "deep":    return "Deep Cleaning";
    case "move":    return "Move In/Out";
    case "office":  return "Office Cleaning";
    case "windows": return "Window Cleaning";
    case "ironing": return "Ironing";
    case "custom":  return "Custom Service";
    default:        return k;
  }
}
