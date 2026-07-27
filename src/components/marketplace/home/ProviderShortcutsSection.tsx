import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CalendarDays, TrendingUp, Wallet, Sparkles } from "lucide-react";

/**
 * ProviderShortcutsSection — Experience Engine surface shown to signed-in
 * providers on the marketplace homepage. Presentation-only; a future
 * Provider Engine hook can hydrate counts/earnings without touching this
 * component.
 */
export function ProviderShortcutsSection() {
  const { t } = useTranslation("marketplace");
  const tiles = [
    { key: "today", href: "/provider-dashboard", Icon: CalendarDays },
    { key: "performance", href: "/provider-dashboard", Icon: TrendingUp },
    { key: "earnings", href: "/provider-dashboard", Icon: Wallet },
    { key: "pricing", href: "/provider/pricing", Icon: Sparkles },
  ] as const;

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-10 lg:px-8" aria-labelledby="provider-home-title">
      <div className="rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 shadow-[var(--mkt-shadow-soft)] sm:p-8">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
            {t("provider_home.eyebrow", "Din dag")}
          </p>
          <h2
            id="provider-home-title"
            className="mt-1 font-serif text-[24px] leading-tight tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[30px]"
          >
            {t("provider_home.heading", "Overblik og genveje")}
          </h2>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(({ key, href, Icon }) => (
            <li key={key}>
              <Link
                to={href}
                className="flex h-full min-h-16 items-center gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted))] p-4 transition-colors hover:border-[hsl(var(--mkt-brand))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
                  <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-[hsl(var(--mkt-ink))]">
                    {t(`provider_home.tiles.${key}.title`, key)}
                  </span>
                  <span className="block text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
                    {t(`provider_home.tiles.${key}.body`, "")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
