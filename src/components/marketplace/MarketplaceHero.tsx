import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CleanerSearchBar } from "./CleanerSearchBar";
import { ShieldCheck, Lock, Star } from "lucide-react";
import heroAsset from "@/assets/hero-europe-v5.jpg.asset.json";

/**
 * MarketplaceHero — responsive premium editorial layout.
 *
 * Design is untouched. Only the responsive behaviour was rebuilt so the
 * hero adapts to every viewport size and aspect ratio without cropping the
 * cleaner, European map or country markers, and without any horizontal
 * overflow. Two layout variants live in the same section:
 *
 *   • md+ (tablet landscape / laptop / desktop): full-bleed image with the
 *     copy + search overlaid on the left. Height uses clamp() so the hero
 *     scales with the viewport instead of a fixed desktop dimension. Image
 *     `object-position` is retuned per breakpoint so the map + cleaner
 *     stay in-frame from tablet through large desktop.
 *
 *   • <md (mobile portrait/landscape): a deliberately mobile layout that
 *     stacks in the required order — eyebrow → headline → description →
 *     hero visual → search → trust → availability. The image renders as a
 *     bounded block so it can never overlap the "Popular services" section.
 */
export function MarketplaceHero() {
  const { t } = useTranslation("marketplace");
  const alt = t("hero.image_alt", "Verified cleaner in a European home");
  const eyebrow = t("hero.eyebrow", "Europas cleaning marketplace");
  const titlePrefix = t("hero.title_prefix", "Book din");
  const titleSuffix = t("hero.title_suffix", "Cleaner");
  const subtitle = t(
    "hero.subtitle",
    "Sammenlign rigtige anmeldelser og gennemsigtige priser. Book direkte i cleanerens kalender.",
  );
  const availability = t(
    "hero.availability",
    "Tilgængelig i Danmark · Sverige · Tyskland · Spanien · Storbritannien",
  );
  const rotatingWords = t("hero.rotating_words", {
    returnObjects: true,
    defaultValue: ["verificerede", "lokale", "bedømte", "betroede"],
  }) as string[];

  return (
    <section className="relative isolate" aria-labelledby="mkt-hero-title">
      {/* ================= md+ : overlay layout ================= */}
      <div
        className="relative hidden isolate overflow-hidden md:block"
        style={{ minHeight: "clamp(380px, 52vh, 560px)" }}
      >
        <img
          src={heroAsset.url}
          alt={alt}
          /**
           * Responsive positioning — no single background-position for all
           * screens. Tablet keeps the cleaner slightly more centered; large
           * desktop shifts right so the map fills the left half behind the copy.
           */
          className="absolute inset-0 h-full w-full object-cover object-[68%_center] lg:object-[70%_center] xl:object-[72%_center]"
          loading="eager"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          decoding="async"
          width={1920}
          height={1088}
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mkt-bg))] via-[hsl(var(--mkt-bg))]/85 to-[hsl(var(--mkt-bg))]/10 lg:to-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[hsl(var(--mkt-bg))] to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex min-h-[inherit] max-w-[1400px] flex-col justify-center gap-5 px-6 py-8 md:py-10 lg:px-8 lg:py-12">
          <div className="max-w-2xl">
            <Eyebrow label={eyebrow} />
            <h1
              id="mkt-hero-title"
              className="mt-4 font-sans font-bold leading-[1.05] tracking-[-0.02em] text-[hsl(var(--mkt-ink))]"
              style={{ fontSize: "clamp(1.9rem, 3.4vw + 0.5rem, 3.25rem)" }}
            >
              {titlePrefix}{" "}
              <RotatingWord words={rotatingWords} />{" "}
              <span className="text-[hsl(var(--mkt-brand))]">{titleSuffix}</span>
            </h1>
            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {subtitle}
            </p>
          </div>

          <div className="max-w-4xl">
            <CleanerSearchBar />
            <TrustRow t={t} />
            <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--mkt-ink-soft))]">
              {availability}
            </p>
          </div>
        </div>
      </div>

      {/* ================= <md : stacked mobile layout ================= */}
      <div className="md:hidden">
        <div className="px-5 pt-6 pb-4">
          <Eyebrow label={eyebrow} />
          <h1
            id="mkt-hero-title-mobile"
            className="mt-3 font-sans font-bold leading-[1.08] tracking-[-0.02em] text-[hsl(var(--mkt-ink))]"
            style={{ fontSize: "clamp(1.75rem, 7.5vw, 2.25rem)" }}
          >
            {titlePrefix}{" "}
            <RotatingWord words={rotatingWords} />{" "}
            <span className="text-[hsl(var(--mkt-brand))]">{titleSuffix}</span>
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
            {subtitle}
          </p>
        </div>

        <div
          className="relative isolate mx-5 overflow-hidden rounded-2xl border border-[hsl(var(--mkt-border))] shadow-[var(--mkt-shadow-soft)]"
          style={{ aspectRatio: "16 / 10" }}
        >
          <img
            src={heroAsset.url}
            alt={alt}
            /**
             * Mobile crop: center-biased so the cleaner and map both stay
             * within the frame at portrait aspect ratios (375 → 430 wide).
             */
            className="absolute inset-0 h-full w-full object-cover object-[58%_center]"
            loading="eager"
            decoding="async"
            width={1920}
            height={1088}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[hsl(var(--mkt-bg))]/60 to-transparent"
            aria-hidden="true"
          />
        </div>

        <div className="px-5 pt-5 pb-6">
          <CleanerSearchBar />
          <TrustRow t={t} />
          <p className="mt-4 text-[11.5px] font-medium uppercase tracking-[0.16em] text-[hsl(var(--mkt-ink-soft))]">
            {availability}
          </p>
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/85 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-brand))] shadow-[var(--mkt-shadow-soft)] backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mkt-brand))]" aria-hidden="true" />
      {label}
    </span>
  );
}

function TrustRow({ t }: { t: (k: string, d?: string) => string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = t as any;
  return _TrustRow(tt);
}
function _TrustRow(t: (k: string, d?: string) => string) {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
      <TrustChip
        icon={<ShieldCheck className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />}
        label={t("hero.trust_verified", "Verificerede cleaners")}
      />
      <TrustChip
        icon={<Lock className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />}
        label={t("hero.trust_payments", "Sikre betalinger")}
      />
      <TrustChip
        icon={<Star className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />}
        label={t("hero.trust_reviews", "Rigtige anmeldelser")}
      />
    </ul>
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
