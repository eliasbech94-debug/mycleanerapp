import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search, CalendarCheck, Sparkles, Truck, Star } from "lucide-react";
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

/**
 * HowItWorksSection — four-step explainer, reusable across all service
 * categories. Copy is fully driven by the Localization Engine; icons are
 * the only visual constant.
 */
export function HowItWorksSection() {
  const { t } = useTranslation("marketplace");
  const [playing, setPlaying] = React.useState(0);
  const videoRefs = React.useRef<Array<HTMLVideoElement | null>>([]);

  React.useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === playing) {
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
  }, [playing]);

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

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-14 lg:px-8" aria-labelledby="how-it-works-title">
      <div className="max-w-2xl">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
          {t("how.eyebrow", "Sådan virker det")}
        </p>
        <h2
          id="how-it-works-title"
          className="mt-2 font-serif text-[28px] leading-tight tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[36px]"
        >
          {t("how.heading", "Fire trin til et rent hjem")}
        </h2>
      </div>
      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ key, Icon, defaults }, idx) => (
          <li
            key={key}
            className="relative rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 shadow-[var(--mkt-shadow-soft)]"
          >
            <span
              className="absolute -top-3 left-6 grid h-7 min-w-7 items-center rounded-full bg-[hsl(var(--mkt-brand))] px-2 text-[12px] font-semibold text-[hsl(var(--mkt-brand-on))]"
              aria-hidden="true"
            >
              {idx + 1}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
              <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-[17px] font-semibold text-[hsl(var(--mkt-ink))]">
              {t(`how.steps.${key}.title`, defaults.title)}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {t(`how.steps.${key}.body`, defaults.body)}
            </p>
            {STEP_VIDEOS[key] ? (
              <video
                ref={(el) => {
                  videoRefs.current[idx] = el;
                }}
                src={STEP_VIDEOS[key]}
                className={`mt-4 aspect-video w-full rounded-2xl border object-cover transition-opacity ${
                  playing === idx
                    ? "border-[hsl(var(--mkt-brand))] opacity-100"
                    : "border-[hsl(var(--mkt-border))] opacity-70"
                }`}
                autoPlay={idx === 0}
                muted
                playsInline
                preload="auto"
                onEnded={() => setPlaying((idx + 1) % steps.length)}
                aria-label={t(`how.steps.${key}.videoLabel`, "Sådan virker det")}
              />
            ) : null}
          </li>

        ))}
      </ol>
    </section>
  );
}
