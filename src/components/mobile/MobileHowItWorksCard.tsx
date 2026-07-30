/**
 * MobileHowItWorksCard — 3-step swipeable "How it works" card.
 *
 * One step fully visible at a time inside a single rounded container.
 * Native horizontal scroll-snap for swipe; buttons + dots as fallback.
 * IntersectionObserver tracks the active step.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, CalendarCheck, Sparkles, Truck, Star, ChevronRight, ChevronLeft } from "lucide-react";
import findCleanerVideo from "@/assets/how-it-works-find-cleaner.mp4.asset.json";
import bookVideo from "@/assets/how-it-works-book.mp4.asset.json";
import enjoyVideo from "@/assets/how-it-works-enjoy.mp4.asset.json";
import onwayVideo from "@/assets/how-it-works-onway.mp4.asset.json";
import rateVideo from "@/assets/how-it-works-rate.mp4.asset.json";

const STEPS = [
  { key: "search", Icon: Search, defaults: { title: "Find cleaner", body: "" } },
  { key: "book", Icon: CalendarCheck, defaults: { title: "Book", body: "" } },
  {
    key: "onway",
    Icon: Truck,
    defaults: {
      title: "Cleaner på vej",
      body: "Følg med når din cleaner er på vej til din adresse.",
    },
  },
  { key: "enjoy", Icon: Sparkles, defaults: { title: "Nyd et rent hjem", body: "" } },
  {
    key: "rate",
    Icon: Star,
    defaults: {
      title: "Godkend og bedøm cleaner",
      body: "Godkend opgaven og giv din cleaner en bedømmelse.",
    },
  },
] as const;

const STEP_VIDEOS: Record<string, string | undefined> = {
  search: findCleanerVideo.url,
  book: bookVideo.url,
  onway: onwayVideo.url,
  enjoy: enjoyVideo.url,
  rate: rateVideo.url,
};

export function MobileHowItWorksCard() {
  const { t } = useTranslation("marketplace");
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [active, setActive] = React.useState(0);
  const videoRefs = React.useRef<Array<HTMLVideoElement | null>>([]);

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
      { root: el, threshold: [0.6, 0.8, 1] },
    );
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const goto = React.useCallback((idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>(`[data-slide="${idx}"]`);
    if (slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, []);

  // Play only the active step's video; auto-advance when it finishes.
  React.useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        void v.play().catch(() => undefined);
      } else {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    });
  }, [active]);

  return (
    <section aria-labelledby="mobile-how-heading" className="px-4 pt-8">
      <div className="rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-brand-soft))]/60 p-4 shadow-[var(--mkt-shadow-soft)]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
              {t("how.eyebrow", "Sådan virker det")}
            </p>
            <h2
              id="mobile-how-heading"
              className="mt-1 font-heading text-[20px] leading-tight tracking-[-0.01em] text-[hsl(var(--mkt-ink))]"
            >
              {t("how.heading", "Fem trin til et rent hjem")}
            </h2>
          </div>
          <span
            aria-live="polite"
            className="text-[12px] font-semibold text-[hsl(var(--mkt-ink-muted))]"
          >
            {t("mobileHome.howItWorks.counter", "{{n}} af {{total}}", {
              n: active + 1,
              total: STEPS.length,
            })}
          </span>
        </div>

        <div
          ref={scrollerRef}
          role="list"
          aria-roledescription="carousel"
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 momentum-scroll [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {STEPS.map(({ key, Icon, defaults }, idx) => (
            <article
              key={key}
              data-slide={idx}
              role="listitem"
              aria-label={t("mobileHome.howItWorks.step_of", "Trin {{n}} af {{total}}", {
                n: idx + 1,
                total: STEPS.length,
              })}
              className="snap-start shrink-0 w-[calc(100vw-72px)] max-w-[320px] rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-3.5 min-h-[150px]"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
                  <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </span>
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-ink-muted))]"
                  aria-hidden
                >
                  0{idx + 1}
                </span>
              </div>
              <h3 className="mt-2.5 text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
                {t(`how.steps.${key}.title`, defaults.title)}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
                {t(`how.steps.${key}.body`, defaults.body)}
              </p>
              {STEP_VIDEOS[key] ? (
                <video
                  ref={(el) => {
                    videoRefs.current[idx] = el;
                  }}
                  src={STEP_VIDEOS[key]}
                  className="mt-2.5 h-24 w-full rounded-lg border border-[hsl(var(--mkt-border))] object-cover"
                  autoPlay={idx === 0}
                  muted
                  playsInline
                  preload="auto"
                  onEnded={() => goto((idx + 1) % STEPS.length)}
                  aria-label={t(`how.steps.${key}.videoLabel`, "Sådan virker det")}
                />
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goto(Math.max(0, active - 1))}
              disabled={active === 0}
              aria-label={t("mobileHome.howItWorks.prev", "Forrige trin")}
              className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))] border border-[hsl(var(--mkt-border))] disabled:opacity-40"
              style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => goto(Math.min(STEPS.length - 1, active + 1))}
              disabled={active === STEPS.length - 1}
              aria-label={t("mobileHome.howItWorks.next", "Næste trin")}
              className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))] border border-[hsl(var(--mkt-border))] disabled:opacity-40"
              style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label={t("mobileHome.howItWorks.progress", "Trin-indikator")}
          >
            {STEPS.map((_, idx) => (
              <span
                key={idx}
                aria-hidden
                className={`h-1.5 rounded-full transition-all ${
                  active === idx
                    ? "w-5 bg-[hsl(var(--mkt-brand))]"
                    : "w-1.5 bg-[hsl(var(--mkt-border-strong))]"
                }`}
              />
            ))}
          </div>
        </div>

        {active === STEPS.length - 1 ? (
          <Link
            to="/find-cleaner"
            className="tap-target mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[hsl(var(--mkt-brand))] px-4 py-3 text-[14px] font-semibold text-white shadow-sm active:scale-[0.99] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
            style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
          >
            {t("mobileHome.howItWorks.cta", "Find din Cleaner")}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default MobileHowItWorksCard;
