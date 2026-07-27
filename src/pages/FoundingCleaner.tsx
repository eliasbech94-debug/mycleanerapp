/**
 * FoundingCleaner — public information page for the "0 kr. i platformsgebyr"
 * campaign. Frontend-only: no client-side eligibility, no countdown, no fake
 * remaining-spots counter. Server-authoritative activation is a separate
 * implementation.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

type Step = { title: string; body: string };
type Terms = {
  heading: string;
  lastUpdatedLabel: string;
  lastUpdated: string;
  items: string[];
};

export default function FoundingCleaner() {
  const { t } = useTranslation("marketplace");
  const eyebrow = t("foundingCleaner.eyebrow", "FOUNDING CLEANER");
  const heading = t("foundingCleaner.heading");
  const intro = t("foundingCleaner.intro");
  const ctaPrimary = t("foundingCleaner.ctaPrimary", "Ansøg som Cleaner");
  const ctaSecondary = t("foundingCleaner.ctaSecondary", "Se vilkårene");
  const startNote = t("foundingCleaner.startNote");
  const howHeading = t("foundingCleaner.how.heading", "Sådan fungerer det");
  const stepsRaw = t("foundingCleaner.how.steps", { returnObjects: true, defaultValue: [] });
  const steps: Step[] = Array.isArray(stepsRaw) ? (stepsRaw as Step[]) : [];
  const termsRaw = t("foundingCleaner.terms", { returnObjects: true, defaultValue: {} });
  const terms: Terms = (termsRaw && typeof termsRaw === "object" && !Array.isArray(termsRaw))
    ? (termsRaw as Terms)
    : ({ heading: "", lastUpdatedLabel: "", lastUpdated: "", items: [] } as Terms);

  React.useEffect(() => {
    const prev = document.title;
    document.title = `${heading} · MyCleaner`;
    return () => { document.title = prev; };
  }, [heading]);

  return (
    <main
      data-testid="founding-cleaner-page"
      data-surface="marketplace"
      className="mx-auto max-w-[900px] px-4 pb-24 pt-8 md:pb-32 md:pt-14"
    >

      {/* Hero */}
      <section aria-labelledby="fc-hero-heading" className="relative overflow-hidden rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] p-6 sm:p-10 shadow-[var(--mkt-shadow-lift)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[hsl(var(--mkt-accent))]/40 blur-3xl" aria-hidden />
        <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--mkt-brand-on))]/15 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {eyebrow}
        </span>
        <h1 id="fc-hero-heading" className="mt-3 font-serif text-[26px] leading-tight tracking-[-0.02em] sm:text-[40px]">
          {heading}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed opacity-95 sm:text-[16.5px]">{intro}</p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed opacity-85">{startNote}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/bliv-cleaner"
            data-testid="fc-cta-primary"
            className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--mkt-brand-on))] px-5 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-brand))] transition-colors hover:bg-[hsl(var(--mkt-brand-on))]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand-on))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mkt-brand))]"
          >
            {ctaPrimary}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href="#fc-terms"
            data-testid="fc-cta-secondary"
            className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--mkt-brand-on))]/40 px-5 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-brand-on))] transition-colors hover:bg-[hsl(var(--mkt-brand-on))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand-on))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mkt-brand))]"
          >
            {ctaSecondary}
          </a>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="fc-how-heading" className="mt-12">
        <h2 id="fc-how-heading" className="font-serif text-[22px] leading-tight text-[hsl(var(--mkt-ink))] sm:text-[28px]">
          {howHeading}
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {(steps ?? []).map((s, i) => (
            <li
              key={i}
              className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--mkt-brand-soft))] text-[13px] font-semibold text-[hsl(var(--mkt-brand))]">
                {i + 1}
              </span>
              <h3 className="mt-3 text-[16px] font-semibold text-[hsl(var(--mkt-ink))]">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Terms */}
      <section id="fc-terms" aria-labelledby="fc-terms-heading" className="mt-12 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="fc-terms-heading" className="font-serif text-[22px] leading-tight text-[hsl(var(--mkt-ink))] sm:text-[26px]">
            {terms?.heading ?? "Vilkår"}
          </h2>
          <p className="text-[12px] text-[hsl(var(--mkt-ink-muted))]">
            <span className="font-semibold">{terms?.lastUpdatedLabel}: </span>
            <time dateTime={terms?.lastUpdated}>{terms?.lastUpdated}</time>
          </p>
        </div>
        <ul className="mt-4 space-y-3">
          {(Array.isArray(terms?.items) ? terms.items : []).map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-[hsl(var(--mkt-ink))]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mkt-brand))]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
