/**
 * Compact review summary for the desktop right column.
 *
 * DISPLAY ONLY — it reuses the review data the page already loaded. No
 * fetching, no new review logic. Hidden entirely when there is nothing to show.
 */
import { Star } from "lucide-react";
import type { PublicProviderProfile, PublicReview } from "./types";

type Props = {
  profile: PublicProviderProfile;
  reviews: PublicReview[] | null;
  /** Anchor id of the full review section further down the page. */
  fullListId: string;
};

export function ProviderReviewsSummary({ profile, reviews, fullListId }: Props) {
  const list = reviews ?? [];
  const hasAggregate = profile.average_rating != null;
  if (!hasAggregate && list.length === 0) return null;

  // Distribution is derived from the reviews already in memory.
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: list.filter((r) => Math.round(r.rating) === star).length,
  }));
  const total = list.length;
  const highlighted = [...list]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 2);

  return (
    <section
      data-testid="provider-reviews-summary"
      className="rounded-3xl bg-white p-6 ring-1 ring-[hsl(222_60%_92%)]"
    >
      <h2 className="text-base font-bold text-[hsl(224_72%_18%)]">Anmeldelser</h2>

      {hasAggregate && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-400/10 px-3 py-2.5 ring-1 ring-amber-400/30">
          <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
          <span className="text-2xl font-extrabold leading-none text-[hsl(224_72%_18%)]">
            {Number(profile.average_rating).toFixed(1)}
          </span>
          {profile.total_reviews != null && (
            <span className="text-sm font-medium text-[hsl(224_45%_25%)]">
              {profile.total_reviews} anmeldelser
            </span>
          )}
        </div>
      )}

      {total > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Fordeling af bedømmelser">
          {counts.map(({ star, count }) => (
            <li key={star} className="flex items-center gap-2 text-xs text-[hsl(224_20%_45%)]">
              <span className="w-3 tabular-nums">{star}</span>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(210_60%_95%)]">
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${total ? (count / total) * 100 : 0}%` }}
                />
              </span>
              <span className="w-5 text-right tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}

      {highlighted.length > 0 && (
        <ul className="mt-4 space-y-3">
          {highlighted.map((r) => (
            <li key={r.id} className="rounded-2xl bg-[hsl(210_60%_97%)] p-3">
              <div className="flex items-center gap-0.5 text-amber-400" aria-label={`${r.rating} af 5`}>
                {Array.from({ length: Math.round(r.rating) }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                ))}
              </div>
              {r.comment && (
                <p className="mt-1.5 line-clamp-4 break-words text-sm text-[hsl(224_45%_20%)]">
                  {r.comment}
                </p>
              )}
              <p className="mt-1 text-xs text-[hsl(224_20%_45%)]">
                {[r.reviewer_first_name, r.reviewer_city].filter(Boolean).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <a
        href={`#${fullListId}`}
        className="mt-4 inline-block rounded-md text-sm font-semibold text-[hsl(222_88%_42%)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
      >
        Se alle anmeldelser
      </a>
    </section>
  );
}

export default ProviderReviewsSummary;
