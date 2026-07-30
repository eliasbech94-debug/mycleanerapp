import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search, CalendarCheck, Sparkles, Truck, Star, Play } from "lucide-react";
import findCleanerVideo from "@/assets/how-it-works-find-cleaner.mp4.asset.json";
import bookVideo from "@/assets/how-it-works-book.mp4.asset.json";
import enjoyVideo from "@/assets/how-it-works-enjoy.mp4.asset.json";
import onwayVideo from "@/assets/how-it-works-onway.mp4.asset.json";
import rateVideo from "@/assets/how-it-works-rate.mp4.asset.json";

const STEP_VIDEOS: Record<string, string | undefined> = {
  search: findCleanerVideo.url,
  book: bookVideo.url,
  onway: onwayVideo.url,
  enjoy: enjoyVideo.url,
  rate: rateVideo.url,
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * HowItWorksSection — five-step explainer, reusable across all service
 * categories. Copy is fully driven by the Localization Engine; icons are
 * the only visual constant. Visual layer only: scroll reveal, timeline
 * progress and single-video-at-a-time playback.
 */
export function HowItWorksSection() {
  const { t } = useTranslation("marketplace");
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = React.useState(0);
  const [inView, setInView] = React.useState(false);
  const [revealed, setRevealed] = React.useState<boolean[]>(() => Array(5).fill(false));
  const videoRefs = React.useRef<Array<HTMLVideoElement | null>>([]);
  const itemRefs = React.useRef<Array<HTMLLIElement | null>>([]);
  const sectionRef = React.useRef<HTMLElement | null>(null);

  const steps = [
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

  // Reveal each card once, when it enters the viewport.
  React.useEffect(() => {
    if (reduced) {
      setRevealed(Array(steps.length).fill(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const idx = Number((e.target as HTMLElement).dataset.step ?? 0);
          setRevealed((prev) => (prev[idx] ? prev : prev.map((v, i) => (i === idx ? true : v))));
          io.unobserve(e.target);
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
    );
    itemRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [reduced, steps.length]);

  // Only run playback while the section itself is at least half visible.
  React.useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Exactly one video plays at a time; others pause and keep their position.
  React.useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === playing && inView) {
        void v.play().catch(() => undefined);
      } else {
        v.pause();
      }
    });
  }, [playing, inView]);

  const progress = ((playing + 1) / steps.length) * 100;

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden"
      aria-labelledby="how-it-works-title"
    >
      {/* Ambient depth — decorative only */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--mkt-brand-soft))]/50 via-transparent to-transparent" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[420px] rounded-full bg-[hsl(var(--mkt-brand))]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-[8%] h-[320px] w-[320px] rounded-full bg-[hsl(var(--mkt-brand))]/[0.07] blur-[110px]" />
      </div>

      <div className="mx-auto max-w-[1400px] px-5 py-20 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
              {t("how.eyebrow", "Sådan virker det")}
            </p>
            <h2
              id="how-it-works-title"
              className="mt-2 font-serif text-[30px] leading-[1.1] tracking-[-0.025em] text-[hsl(var(--mkt-ink))] sm:text-[40px]"
            >
              {t("how.heading", "Fem trin til et rent hjem")}
            </h2>
          </div>

          {/* Progress indicator */}
          <div className="w-full max-w-[240px]">
            <div className="flex items-baseline justify-between text-[12px] font-semibold text-[hsl(var(--mkt-ink-muted))]">
              <span aria-live="polite">
                {t("mobileHome.howItWorks.counter", "{{n}} af {{total}}", {
                  n: playing + 1,
                  total: steps.length,
                })}
              </span>
              <span aria-hidden>{String(playing + 1).padStart(2, "0")}/0{steps.length}</span>
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--mkt-border))]"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={playing + 1}
            >
              <div
                className="h-full origin-left rounded-full bg-[hsl(var(--mkt-brand))] transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{ transform: `scaleX(${progress / 100})`, width: "100%" }}
              />
            </div>
          </div>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {steps.map(({ key, Icon, defaults }, idx) => {
            const isActive = playing === idx;
            const isDone = idx < playing;
            return (
              <li
                key={key}
                data-step={idx}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className={`group relative rounded-[26px] border bg-[hsl(var(--mkt-surface))] p-5 transition-[transform,box-shadow,border-color,opacity] duration-500 ease-out will-change-transform motion-reduce:transition-none hover:-translate-y-1 motion-reduce:hover:translate-y-0 ${
                  isActive
                    ? "border-[hsl(var(--mkt-brand))]/45 shadow-[0_18px_48px_-24px_hsl(var(--mkt-brand)/0.45)]"
                    : "border-[hsl(var(--mkt-border))] shadow-[var(--mkt-shadow-soft)]"
                } ${revealed[idx] ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}
                style={{ transitionDelay: revealed[idx] && !reduced ? `${idx * 60}ms` : undefined }}
              >
                {/* timeline connector */}
                <span
                  aria-hidden
                  className="absolute left-full top-9 hidden h-px w-5 xl:block"
                  style={{
                    background: isDone
                      ? "hsl(var(--mkt-brand))"
                      : "hsl(var(--mkt-border-strong))",
                  }}
                />
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-2xl transition-colors duration-300 motion-reduce:transition-none ${
                      isActive || isDone
                        ? "bg-[hsl(var(--mkt-brand))] text-white"
                        : "bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--mkt-ink-muted))]"
                    aria-hidden="true"
                  >
                    0{idx + 1}
                  </span>
                </div>

                <h3 className="mt-4 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-[hsl(var(--mkt-ink))]">
                  {t(`how.steps.${key}.title`, defaults.title)}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
                  {t(`how.steps.${key}.body`, defaults.body)}
                </p>

                {STEP_VIDEOS[key] ? (
                  <div
                    className={`relative mt-4 overflow-hidden rounded-[20px] border transition-[opacity,box-shadow,border-color] duration-500 motion-reduce:transition-none ${
                      isActive
                        ? "border-[hsl(var(--mkt-brand))]/40 opacity-100 shadow-[0_10px_30px_-18px_hsl(222_47%_11%/0.5)]"
                        : "border-[hsl(var(--mkt-border))] opacity-80"
                    }`}
                  >
                    <video
                      ref={(el) => {
                        videoRefs.current[idx] = el;
                      }}
                      src={STEP_VIDEOS[key]}
                      className="h-28 w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      muted
                      loop={false}
                      playsInline
                      preload="metadata"
                      onEnded={() => setPlaying((idx + 1) % steps.length)}
                      aria-label={t(`how.steps.${key}.videoLabel`, "Sådan virker det")}
                    />
                    <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                      <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
                      {t("how.livePreview", "Live preview")}
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
