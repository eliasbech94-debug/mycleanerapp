import { useTranslation } from "react-i18next";
import { Apple, Smartphone } from "lucide-react";

/**
 * DownloadAppSection — placeholder for the mobile apps. Renders only when
 * translations provide at least one working URL, so we never ship a link
 * that goes nowhere. Buttons are large tap targets (min 44×44) per WCAG.
 */
export function DownloadAppSection() {
  const { t } = useTranslation("marketplace");
  const iosHref = t("app.ios_href", { defaultValue: "" });
  const androidHref = t("app.android_href", { defaultValue: "" });
  if (!iosHref && !androidHref) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-14 lg:px-8" aria-labelledby="app-title">
      <div className="rounded-[28px] border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted))] p-8 shadow-[var(--mkt-shadow-soft)] sm:p-12">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
              {t("app.eyebrow", "MyCleaner-appen")}
            </p>
            <h2 id="app-title" className="mt-2 font-serif text-[26px] leading-tight tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[34px]">
              {t("app.heading", "Book og genbook fra lommen")}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {t("app.body", "Følg din booking, chat med din cleaner og betal sikkert — alt i én app.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {iosHref && (
              <a
                href={iosHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[hsl(var(--mkt-ink))] px-5 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-surface))] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
              >
                <Apple className="h-5 w-5" aria-hidden="true" />
                {t("app.ios", "App Store")}
              </a>
            )}
            {androidHref && (
              <a
                href={androidHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[hsl(var(--mkt-ink))] px-5 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-surface))] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
              >
                <Smartphone className="h-5 w-5" aria-hidden="true" />
                {t("app.android", "Google Play")}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
