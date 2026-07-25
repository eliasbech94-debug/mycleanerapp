import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, Wrench, Trees, Truck } from "lucide-react";

const ITEMS = [
  { key: "cleaning", icon: Sparkles },
  { key: "handyman", icon: Wrench },
  { key: "garden",   icon: Trees },
  { key: "moving",   icon: Truck },
] as const;

/**
 * Popular services grid. Each item routes to /marketplace?category=…
 * using the shared search-submission contract.
 */
export function ServiceCategoryGrid() {
  const { t } = useTranslation("marketplace");
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-12 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-serif text-[26px] tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[32px]">
          {t("categories.heading", "Popular services")}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {ITEMS.map(({ key, icon: Icon }) => (
          <Link
            key={key}
            to={`/marketplace?category=${key}`}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 transition hover:border-[hsl(var(--mkt-brand))]/40 hover:shadow-[var(--mkt-shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2 sm:p-5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))] transition group-hover:bg-[hsl(var(--mkt-brand))] group-hover:text-[hsl(var(--mkt-brand-on))]">
              <Icon className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">{t(`categories.${key}`, key)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
