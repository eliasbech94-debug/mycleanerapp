/**
 * MobileHowItWorksCard — 5-step swipeable "How it works" card.
 *
 * One step fully visible at a time inside a single rounded container.
 * Native horizontal scroll-snap for swipe; buttons + dots as fallback.
 * IntersectionObserver tracks the active step.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search,
  CalendarCheck,
  Sparkles,
  Truck,
  Star,
  ChevronRight,
  ChevronLeft,
  Play,
} from "lucide-react";
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
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const [active, setActive] = React.useState(0);
  const [inView, setInView] = React.useState(false);
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

  // Only play while the section is meaningfully on screen.
  React.useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.5),
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
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
      if (i === active && inView) {
        void v.play().catch(() => undefined);
      } else {
        v.pause();
      }
    });
  }, [active, inView]);

  return (
    <section ref={sectionRef} aria-labelledby="mobile-how-heading" className="relative px-4 pt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-[hsl(var(--mkt-brand))]/[0.07] to-transparent"
      />
      <div className="rounded-[28px] border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-brand-soft))]/60 p-4 shadow-[var(--mkt-shadow-soft)]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
              {t("how.eyebrow", "Sådan virker det")}
            </p>
            <h2
              id="mobile-how-heading"
              className="mt-1 font-heading text-[21px] leading-tight tracking-[-0.015em] text-[hsl(var(--mkt-ink))]"
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
          className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--mkt-border))]"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={active + 1}
        >
          <div
            className="h-full w-full origin-left rounded-full bg-[hsl(var(--mkt-brand))] transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${(active + 1) / STEPS.length})` }}
          />
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
              className={`snap-start shrink-0 w-[calc(100vw-56px)] max-w-[360px] rounded-[24px] border bg-[hsl(var(--mkt-surface))] p-4 transition-[border-color,box-shadow,opacity] duration-400 ease-out motion-reduce:transition-none ${
                active === idx
                  ? "border-[hsl(var(--mkt-brand))]/45 opacity-100 shadow-[0_16px_40px_-24px_hsl(var(--mkt-brand)/0.5)]"
                  : "border-[hsl(var(--mkt-border))] opacity-90"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl transition-colors duration-300 motion-reduce:transition-none ${
                    active >= idx
                      ? "bg-[hsl(var(--mkt-brand))] text-white"
                      : "bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </span>
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-ink-muted))]"
                  aria-hidden
                >
                  0{idx + 1}
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.01em] text-[hsl(var(--mkt-ink))]">
                {t(`how.steps.${key}.title`, defaults.title)}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
                {t(`how.steps.${key}.body`, defaults.body)}
              </p>
              {STEP_VIDEOS[key] ? (
                <div className="relative mt-3 overflow-hidden rounded-[20px] border border-[hsl(var(--mkt-border))] shadow-[0_10px_28px_-20px_hsl(222_47%_11%/0.55)]">
                  <video
                    ref={(el) => {
                      videoRefs.current[idx] = el;
                    }}
                    src={STEP_VIDEOS[key]}
                    className="h-40 w-full object-cover"
                    muted
                    loop={false}
                    playsInline
                    preload="metadata"
                    onEnded={() => goto((idx + 1) % STEPS.length)}
                    aria-label={t(`how.steps.${key}.videoLabel`, "Sådan virker det")}
                  />
                  <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                    <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
                    {t("how.livePreview", "Live preview")}
                  </span>
                </div>
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
                className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
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
