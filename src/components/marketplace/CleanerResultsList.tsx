import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";
import { CompactProviderCard } from "@/components/marketplace/CompactProviderCard";

/**
 * Homepage primary rail — "Recommended near you".
 *
 * Simplification pass: renders the shared CompactProviderCard in a calm grid.
 * No bios, no metadata blocks, no badge stacks. Presentation only.
 */
export function CleanerResultsList({
  providers,
  loading,
  emptyLabel,
  isDemo = false,
  error = null,
  onRetry,
}: {
  providers: MarketplaceProvider[] | null;
  loading: boolean;
  emptyLabel?: string;
  isDemo?: boolean;
  /** Structured error object from useMarketplaceProviders. Never rendered raw. */
  error?: null | { code: string; message: string };
  onRetry?: () => void;
}) {
  const { t } = useTranslation("marketplace");

  return (
    <section className="mx-auto max-w-[1400px] px-5 pt-12 lg:px-8">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] font-semibold tracking-tight text-[hsl(var(--mkt-ink))] lg:text-[22px]">
          {t("results.heading", "Anbefalet i nærheden")}
        </h2>
        <Link
          to="/marketplace"
          className="shrink-0 text-[13.5px] font-semibold text-[hsl(var(--mkt-brand))] hover:underline"
        >
          {t("results.see_all", "View all")}
        </Link>
      </div>

      <div aria-live="polite" aria-busy={loading}>
        {loading && (!providers || providers.length === 0) ? (
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <SkeletonCard />
              </li>
            ))}
          </ul>
        ) : error ? (
          <div
            role="alert"
            className="rounded-3xl border border-[hsl(var(--mkt-border-strong))] bg-[hsl(var(--mkt-surface))] p-8 text-center"
          >
            <p className="text-[14px] font-medium text-[hsl(var(--mkt-ink))]">
              {t("results.error_title", "We couldn't load available cleaners right now.")}
            </p>
            <p className="mt-1 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              {t("results.error_hint", "Please try again in a moment.")}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-[hsl(var(--mkt-brand))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--mkt-brand-on))] transition hover:bg-[hsl(var(--mkt-brand-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
              >
                {t("results.retry", "Try again")}
              </button>
            )}
          </div>
        ) : (providers ?? []).length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[hsl(var(--mkt-border-strong))] bg-[hsl(var(--mkt-surface))] p-10 text-center text-[14px] text-[hsl(var(--mkt-ink-muted))]">
            {t("results.empty", {
              defaultValue: "No cleaners yet in {{area}}. Try another area.",
              area: emptyLabel ?? t("results.empty_area", "your area"),
            })}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(providers ?? []).slice(0, 4).map((p) => (
              <li key={p.provider_slug}>
                <CompactProviderCard provider={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {isDemo && <span className="sr-only">{t("results.demo_badge", "Demo")}</span>}
    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]">
      <div className="aspect-[4/3] animate-pulse bg-[hsl(var(--mkt-surface-muted))]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-28 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
        <div className="h-3 w-20 animate-pulse rounded bg-[hsl(var(--mkt-surface-muted))]" />
      </div>
    </div>
  );
}
