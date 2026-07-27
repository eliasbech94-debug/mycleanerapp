/**
 * MobileHowItWorksCard — 3-step swipeable "How it works" card.
 *
 * Presentation only. Uses the existing `how.*` translations that the
 * desktop `HowItWorksSection` also relies on. Swipe via native horizontal
 * scroll-snap so the interaction feels native and needs no gesture lib.
 * Dots reflect the active card via IntersectionObserver on each slide.
 * Reduced-motion disables the snap animation via CSS defaults.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, CalendarCheck, Sparkles, ChevronRight } from "lucide-react";

const STEPS = [
  { key: "search", Icon: Search },
  { key: "book", Icon: CalendarCheck },
  { key: "enjoy", Icon: Sparkles },
] as const;

export function MobileHowItWorksCard() {
  const { t } = useTranslation("marketplace");
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const slides = Array.from(el.querySelectorAll<HTMLElement>("[data-slide]"));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = Number((visible.target as HTMLElement).dataset.slide ?? 0);
          setActive(idx);
        }
      },
      { root: el, threshold: [0.5, 0.75, 1] },
    );
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <section
      aria-labelledby="mobile-how-heading"
      className="pt-8"
    >
      <div className="mb-3 px-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
          {t("how.eyebrow", "Sådan virker det")}
        </p>
        <h2
          id="mobile-how-heading"
          className="mt-1 font-heading text-[22px] leading-tight tracking-[-0.01em] text-[hsl(var(--mkt-ink))]"
        >
          {t("how.heading", "Tre trin til et rent hjem")}
        </h2>
      </div>
      <div
        ref={scrollerRef}
        role="list"
        aria-roledescription="carousel"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 momentum-scroll"
      >
        {STEPS.map(({ key, Icon }, idx) => (
          <article
            key={key}
            data-slide={idx}
            role="listitem"
            aria-label={t("mobileHome.howItWorks.step_of", "Trin {{n}} af {{total}}", {
              n: idx + 1,
              total: STEPS.length,
            })}
            className="snap-center shrink-0 w-[calc(100vw-48px)] max-w-[380px] rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 shadow-[var(--mkt-shadow-soft)]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
                <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </span>
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-ink-muted))]"
                aria-hidden
              >
                0{idx + 1}
              </span>
            </div>
            <h3 className="mt-4 text-[18px] font-semibold text-[hsl(var(--mkt-ink))]">
              {t(`how.steps.${key}.title`, key)}
            </h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {t(`how.steps.${key}.body`, "")}
            </p>
          </article>
        ))}
      </div>
      {/* Progress dots */}
      <div
        className="mt-2 flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label={t("mobileHome.howItWorks.progress", "Trin-indikator")}
      >
        {STEPS.map((_, idx) => (
          <span
            key={idx}
            aria-hidden
            className={`h-1.5 rounded-full transition-all ${
              active === idx ? "w-5 bg-[hsl(var(--mkt-brand))]" : "w-1.5 bg-[hsl(var(--mkt-border))]"
            }`}
          />
        ))}
      </div>
      <div className="mt-4 px-4">
        <Link
          to="/find-cleaner"
          className="tap-target inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[hsl(var(--mkt-brand))] px-4 py-3 text-[14px] font-semibold text-white shadow-sm active:scale-[0.99] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
          style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
        >
          {t("mobileHome.howItWorks.cta", "Find en Cleaner")}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

export default MobileHowItWorksCard;
