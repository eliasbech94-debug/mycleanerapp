import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CleanerSearchBar } from "./CleanerSearchBar";
import { ShieldCheck, Lock, Star } from "lucide-react";
import heroAsset from "@/assets/hero-europe-v3.png.asset.json";

/**
 * MarketplaceHero — premium editorial layout.
 *
 * Full-bleed hero photo (professional cleaner + subtly integrated Europe
 * map on the wall highlighting DK · SE · DE · UK · ES) with the left third
 * intentionally reserved as an empty area for CMS/localization-driven text.
 * The image itself contains NO text, logos, flags or country labels — every
 * label is rendered by the Localization Engine via `react-i18next`.
 */
export function MarketplaceHero() {
  const { t } = useTranslation("marketplace");
  return (
    <section className="relative" aria-labelledby="mkt-hero-title">
      <div className="relative min-h-[360px] overflow-hidden sm:min-h-[400px] lg:min-h-[460px]">
        <img
          src={heroAsset.url}
          alt={t("hero.image_alt", "Verified cleaner in a European home")}
          className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
          loading="eager"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          decoding="async"
          width={1920}
          height={1088}
        />
        {/* Layered gradient overlays: keep the empty left area readable
            without washing the photograph on the right. Stronger on mobile
            where the text overlays the cleaner more directly. */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mkt-bg))] via-[hsl(var(--mkt-bg))]/85 to-[hsl(var(--mkt-bg))]/10 lg:to-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[hsl(var(--mkt-bg))] to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-6 pt-8 lg:px-8 lg:pb-10 lg:pt-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/85 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-brand))] shadow-[var(--mkt-shadow-soft)] backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mkt-brand))]" aria-hidden="true" />
              {t("hero.eyebrow", "Europas cleaning marketplace")}
            </span>
            <h1
              id="mkt-hero-title"
              className="mt-4 font-sans font-bold text-[30px] leading-[1.05] tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[40px] lg:text-[52px]"
            >
              {t("hero.title_prefix", "Book din")}{" "}
              <RotatingWord
                words={t("hero.rotating_words", {
                  returnObjects: true,
                  defaultValue: ["verificerede", "lokale", "bedømte", "betroede"],
                }) as string[]}
              />{" "}
              <span className="text-[hsl(var(--mkt-brand))]">
                {t("hero.title_suffix", "Cleaner")}
              </span>
            </h1>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {t("hero.subtitle", "Sammenlign rigtige anmeldelser og gennemsigtige priser. Book direkte i cleanerens kalender.")}
            </p>
          </div>

          <div className="mt-8 max-w-4xl">
            <CleanerSearchBar />
            <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              <TrustChip icon={<ShieldCheck className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />} label={t("hero.trust_verified", "Verificerede cleaners")} />
              <TrustChip icon={<Lock className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />} label={t("hero.trust_payments", "Sikre betalinger")} />
              <TrustChip icon={<Star className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />} label={t("hero.trust_reviews", "Rigtige anmeldelser")} />
            </ul>
            <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--mkt-ink-soft))]">
              {t("hero.availability", "Tilgængelig i Danmark · Sverige · Tyskland · Spanien · Storbritannien")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * RotatingWord — cycles a short list of adjectives inside the H1. Presentation
 * only; honors `prefers-reduced-motion` by pausing rotation and removing the
 * transform animation. Reserves width of the longest word to avoid layout shift.
 */
function RotatingWord({ words, intervalMs = 2200 }: { words: string[]; intervalMs?: number }) {
  const safeWords = words && words.length > 0 ? words : ["verificerede"];
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (reduced || safeWords.length < 2) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % safeWords.length), intervalMs);
    return () => window.clearInterval(id);
  }, [reduced, safeWords.length, intervalMs]);

  const longest = safeWords.reduce((a, b) => (b.length > a.length ? b : a), "");
  const current = safeWords[i];

  return (
    <span className="relative inline-grid align-baseline text-[hsl(var(--mkt-brand))]" aria-live="polite">
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap italic">{longest}</span>
      <span
        key={current}
        className="col-start-1 row-start-1 whitespace-nowrap italic motion-safe:animate-[mktRotateWord_600ms_ease-out]"
      >
        {current}
      </span>
    </span>
  );
}

function TrustChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </li>
  );
}
