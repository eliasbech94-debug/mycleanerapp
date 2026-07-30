/** Reviews — lazy-loaded, verified bookings only. Hidden when there is no data. */
import { useEffect, useRef } from "react";
import { Star } from "lucide-react";
import SectionHeading from "./SectionHeading";
import type { PublicProviderProfile, PublicReview } from "./types";

type Props = {
  profile: PublicProviderProfile;
  reviews: PublicReview[] | null;
  onVisible: () => void;
};

export function ProviderReviews({ profile, reviews, onVisible }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      onVisible();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && onVisible()),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);

  const hasReviews = (reviews?.length ?? 0) > 0;
  const hasAggregate = profile.average_rating != null;

  return (
    <div ref={ref} data-testid="provider-reviews-anchor">
      {(hasReviews || hasAggregate) && (
        <section className="space-y-4" data-testid="provider-reviews">
          <SectionHeading icon={Star} title="Anmeldelser" tone="amber" />
          {hasAggregate && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 ring-1 ring-amber-400/30">
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="text-3xl font-extrabold leading-none text-[hsl(224_72%_18%)]">
                {Number(profile.average_rating).toFixed(1)}
              </span>
              {profile.total_reviews != null && (
                <span className="text-sm font-medium text-[hsl(224_45%_25%)]">
                  {profile.total_reviews} anmeldelser
                </span>
              )}
            </div>
          )}
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 xl:gap-4">
            {(reviews ?? []).map((r) => (
              <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)]">
                <div className="flex items-center gap-1 text-amber-400" aria-label={`${r.rating} af 5`}>
                  {Array.from({ length: Math.round(r.rating) }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" aria-hidden="true" />
                  ))}
                </div>
                {r.comment && (
                  <p className="mt-2 break-words text-sm text-[hsl(224_45%_20%)]">{r.comment}</p>
                )}
                <p className="mt-1 text-xs text-[hsl(224_20%_45%)]">
                  {[r.reviewer_first_name, r.reviewer_city].filter(Boolean).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default ProviderReviews;
