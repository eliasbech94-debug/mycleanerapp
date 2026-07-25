import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CleanerSearchBar } from "./CleanerSearchBar";
import { ShieldCheck, Lock, Star } from "lucide-react";
import livingroomAsset from "@/assets/home-livingroom.jpg.asset.json";

/**
 * MarketplaceHero — reference-matched layout:
 *   full-width interior photo, headline overlaid on left,
 *   horizontal search bar underneath, trust chips below the bar.
 */
export function MarketplaceHero() {
  const { t } = useTranslation("marketplace");
  return (
    <section className="relative">
      <div className="relative overflow-hidden">
        <img
          src={livingroomAsset.url}
          alt={t("hero.image_alt", "Freshly cleaned home interior")}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          width={1920}
          height={720}
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mkt-bg))] via-[hsl(var(--mkt-bg))]/85 to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-[1400px] px-5 pb-10 pt-14 lg:px-8 lg:pb-16 lg:pt-20">
          <div className="max-w-2xl">
            <h1 className="font-serif text-[40px] leading-[1.02] tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[52px] lg:text-[60px]">
              {t("hero.title_prefix", "Book din")}{" "}
              <RotatingWord
                words={t("hero.rotating_words", {
                  returnObjects: true,
                  defaultValue: ["verificerede", "lokale", "bedømte", "betroede"],
                }) as string[]}
              />
              <br />
              <span className="text-[hsl(var(--mkt-brand))]">
                {t("hero.title_suffix", "Cleaner")}
              </span>
            </h1>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {t("hero.subtitle", "Connect with verified cleaners near you. Book online, pay securely, and enjoy a spotless home.")}
            </p>
          </div>

          <div className="mt-8 max-w-4xl">
            <CleanerSearchBar />
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              <TrustChip icon={<ShieldCheck className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("hero.trust_verified", "Trusted & verified cleaners")} />
              <TrustChip icon={<Lock className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("hero.trust_payments", "Secure payments")} />
              <TrustChip icon={<Star className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("hero.trust_reviews", "Real customer reviews")} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * RotatingWord — cycles a short list of adjectives inside the H1.
 * Presentation-only; respects prefers-reduced-motion by disabling the
 * animation and pausing rotation for accessibility.
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

  // Reserve width using the longest word so the following <br/> line doesn't jump.
  const longest = safeWords.reduce((a, b) => (b.length > a.length ? b : a), "");
  const current = safeWords[i];

  return (
    <span
      className="relative inline-grid align-baseline text-[hsl(var(--mkt-brand))]"
      aria-live="polite"
    >
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap italic">{longest}</span>
      <span
        key={current}
        className="col-start-1 row-start-1 whitespace-nowrap italic animate-[mktRotateWord_600ms_ease-out]"
      >
        {current}
      </span>
    </span>
  );
}

function TrustChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  );
}
