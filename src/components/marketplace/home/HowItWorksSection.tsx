import { useTranslation } from "react-i18next";
import { Search, CalendarCheck, Sparkles } from "lucide-react";
import findCleanerVideo from "@/assets/how-it-works-find-cleaner.mp4.asset.json";


/**
 * HowItWorksSection — three-step explainer, reusable across all service
 * categories. Copy is fully driven by the Localization Engine; icons are
 * the only visual constant.
 */
export function HowItWorksSection() {
  const { t } = useTranslation("marketplace");
  const steps = [
    { key: "search", Icon: Search },
    { key: "book", Icon: CalendarCheck },
    { key: "enjoy", Icon: Sparkles },
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
          {t("how.heading", "Tre trin til et rent hjem")}
        </h2>
      </div>
      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map(({ key, Icon }, idx) => (
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
              {t(`how.steps.${key}.title`, key)}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {t(`how.steps.${key}.body`, "")}
            </p>
            {key === "search" || key === "book" ? (
              <video
                src={key === "search" ? findCleanerVideo.url : bookVideo.url}
                className="mt-4 aspect-video w-full rounded-2xl border border-[hsl(var(--mkt-border))] object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={t(`how.steps.${key}.videoLabel`, "Sådan virker det")}
              />
            ) : null}
          </li>

        ))}
      </ol>
    </section>
  );
}
