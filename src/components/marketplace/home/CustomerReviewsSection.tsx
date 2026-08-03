import { useTranslation } from "react-i18next";
import { Star, Quote } from "lucide-react";

/**
 * CustomerReviewsSection — testimonial trio. Copy resolves via the
 * Localization Engine (returnObjects); when translations are absent this
 * section renders nothing so a future Review Engine wire-up can take over
 * without shipping empty cards.
 */
export function CustomerReviewsSection() {
  const { t } = useTranslation("marketplace");
  const reviews = t("reviews.items", {
    returnObjects: true,
    defaultValue: [] as Array<{ quote: string; name: string; city: string; rating?: number }>,
  }) as Array<{ quote: string; name: string; city: string; rating?: number }>;

  if (!reviews?.length) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-14 lg:px-8" aria-labelledby="reviews-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
            {t("reviews.eyebrow", "Fra vores kunder")}
          </p>
          <h2
            id="reviews-title"
            className="mt-2 font-serif text-[28px] leading-tight tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[36px]"
          >
            {t("reviews.heading", "Elsket i hele Europa")}
          </h2>
        </div>
      </div>
      <ul className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
        {reviews.slice(0, 3).map((r, i) => (
          <li
            key={i}
            className="flex h-full flex-col rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 shadow-[var(--mkt-shadow-soft)]"
          >
            <Quote className="h-5 w-5 text-[hsl(var(--mkt-brand))]" aria-hidden="true" />
            <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-[hsl(var(--mkt-ink))]">
              “{r.quote}”
            </blockquote>
            <div className="mt-6 flex items-center justify-between">
              <div className="text-[13.5px]">
                <div className="font-semibold text-[hsl(var(--mkt-ink))]">{r.name}</div>
                <div className="text-[hsl(var(--mkt-ink-muted))]">{r.city}</div>
              </div>
              <div className="flex items-center gap-0.5" aria-label={`${r.rating ?? 5} / 5`}>
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    className="h-4 w-4"
                    fill={s < (r.rating ?? 5) ? "hsl(var(--mkt-star))" : "transparent"}
                    stroke="hsl(var(--mkt-star))"
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
