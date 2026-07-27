/**
 * MobileHowItWorksCard — mobile-only, single-container 3-step swipe card
 * that replaces the desktop three-column `HowItWorksSection` on <768px.
 *
 * Behaviour:
 *  - Horizontal scroll-snap between the 3 steps. Native scroll — vertical
 *    document scrolling continues to work as expected.
 *  - No auto-advance. Manual only.
 *  - Progress indicator ("X af 3") + three markers + keyboard-accessible
 *    prev/next buttons with translated aria-labels.
 *  - Card overall height is stable (fixed step body height).
 *  - Last step surfaces a "Find din Cleaner" CTA to the existing
 *    `/find-cleaner` route.
 *  - `prefers-reduced-motion: reduce` disables smooth-scroll behaviour.
 *
 * Content is fully driven by the existing `how.*` marketplace i18n keys
 * that already ship in DA/EN/SV/ES.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Search, CalendarCheck, Sparkles } from "lucide-react";

const STEPS = [
  { key: "search", Icon: Search },
  { key: "book", Icon: CalendarCheck },
  { key: "enjoy", Icon: Sparkles },
] as const;

export function MobileHowItWorksCard() {
  const { t } = useTranslation("marketplace");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const scrollTo = useCallback((idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (!child) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: child.offsetLeft, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Update active step from scroll position.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const width = el.clientWidth;
        if (width <= 0) return;
        const idx = Math.round(el.scrollLeft / width);
        setActive(Math.max(0, Math.min(STEPS.length - 1, idx)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const goPrev = () => scrollTo(Math.max(0, active - 1));
  const goNext = () => scrollTo(Math.min(STEPS.length - 1, active + 1));

  return (
    <section
      className="px-4 pt-6"
      aria-labelledby="mobile-how-heading"
      data-testid="mobile-how-card"
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2
          id="mobile-how-heading"
          className="text-[17px] font-semibold text-[hsl(var(--mkt-ink))]"
        >
          {t("how.heading", "Sådan virker MyCleaner")}
        </h2>
        <span
          aria-live="polite"
          className="text-[12px] font-semibold text-[hsl(var(--mkt-ink-muted))]"
        >
          {t("mobileHome.how.progress", "{{current}} af {{total}}", {
            current: active + 1,
            total: STEPS.length,
          })}
        </span>
      </div>

      <div className="relative rounded-3xl border border-[hsl(var(--mkt-border))] bg-gradient-to-br from-[hsl(var(--mkt-brand-soft))] to-[hsl(var(--mkt-surface))] p-1 shadow-[var(--app-shadow-card,0_1px_2px_rgba(0,0,0,0.04))]">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-[calc(1.5rem-4px)] [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ WebkitOverflowScrolling: "touch" }}
          role="group"
          aria-roledescription={t("mobileHome.how.carousel", "Trin-for-trin")}
        >
          <style>{`[data-testid="mobile-how-card"] > div > div::-webkit-scrollbar{display:none}`}</style>
          {STEPS.map(({ key, Icon }, idx) => (
            <article
              key={key}
              className="min-w-full snap-start px-5 py-6"
              aria-roledescription="slide"
              aria-label={t("mobileHome.how.slideLabel", "Trin {{current}} af {{total}}", {
                current: idx + 1,
                total: STEPS.length,
              })}
            >
              <div className="flex min-h-[168px] flex-col">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[hsl(var(--mkt-brand))] shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden strokeWidth={2.25} />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--mkt-brand))]">
                    {t("mobileHome.how.stepEyebrow", "Trin {{n}}", { n: idx + 1 })}
                  </span>
                </div>
                <h3 className="mt-3 text-[18px] font-semibold leading-snug text-[hsl(var(--mkt-ink))]">
                  {t(`how.steps.${key}.title`, key)}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
                  {t(`how.steps.${key}.body`, "")}
                </p>
                {idx === STEPS.length - 1 ? (
                  <Link
                    to="/find-cleaner"
                    className="tap-target mt-auto inline-flex w-fit items-center gap-1.5 self-start rounded-full bg-[hsl(var(--mkt-brand))] px-4 py-2 text-[13px] font-semibold text-white shadow-sm active:scale-[0.98] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
                    style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
                  >
                    {t("mobileHome.how.finalCta", "Find din Cleaner")}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Controls + dot indicators */}
      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={active === 0}
          aria-label={t("mobileHome.how.prev", "Forrige trin")}
          className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))] disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === active
                  ? "w-6 bg-[hsl(var(--mkt-brand))]"
                  : "w-1.5 bg-[hsl(var(--mkt-border))]")
              }
            />
          ))}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={active === STEPS.length - 1}
          aria-label={t("mobileHome.how.next", "Næste trin")}
          className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))] disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

export default MobileHowItWorksCard;
