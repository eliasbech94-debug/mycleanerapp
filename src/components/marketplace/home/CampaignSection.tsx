import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * CampaignSection — CMS-driven country/campaign banner. Copy resolves via
 * the Localization + Country engines; when there's no active headline the
 * section renders nothing so the Campaign Engine can decide visibility
 * without ever shipping an empty ribbon.
 */
export function CampaignSection() {
  const { t } = useTranslation("marketplace");
  const title = t("campaign.title", { defaultValue: "" });
  if (!title) return null;
  const body = t("campaign.body", { defaultValue: "" });
  const note = t("campaign.note", { defaultValue: "" });
  const cta = t("campaign.cta", { defaultValue: "Læs mere" });
  const href = t("campaign.href", { defaultValue: "/founding-cleaner" });

  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-6 pb-0 md:px-5 md:py-14 lg:px-8" aria-labelledby="campaign-title">
      <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] shadow-[var(--mkt-shadow-lift)] md:rounded-[28px]">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[hsl(var(--mkt-accent))]/40 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 p-6 sm:p-10 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--mkt-brand-on))]/15 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("campaign.eyebrow", "Kampagne")}
            </span>
            <h2 id="campaign-title" className="mt-3 font-serif text-[20px] leading-tight tracking-[-0.02em] sm:text-[34px]">
              {title}
            </h2>
            {body && <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed opacity-90">{body}</p>}
            {note && <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed opacity-80">{note}</p>}
          </div>
          <Link
            to={href}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[hsl(var(--mkt-brand-on))] px-5 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-brand))] transition-colors hover:bg-[hsl(var(--mkt-brand-on))]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand-on))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mkt-brand))]"
          >
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
