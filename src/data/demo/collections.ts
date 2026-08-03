import type { DemoProvider } from "./providers";
import { getDemoReviews } from "./reviews";
import { getDemoBookings } from "./bookings";
import { getDemoFavoriteCount } from "./activity";
import { hashSeed, mulberry32 } from "./random";

/**
 * Homepage collections — derived purely from the local fixtures so the landing
 * page always feels like an active marketplace in development.
 */
export type DemoCollectionId =
  | "featured"
  | "most_booked"
  | "top_rated"
  | "fast_response"
  | "new_this_week"
  | "recently_reviewed"
  | "recommended_near_you";

export type DemoCollection = {
  id: DemoCollectionId;
  title: string;
  subtitle: string;
  providers: DemoProvider[];
};

export type DemoTrendingService = {
  service: string;
  bookings_last_7_days: number;
  change_pct: number;
};

const take = <T,>(rows: T[], limit: number) => rows.slice(0, limit);

export function buildDemoCollections(providers: DemoProvider[], limit = 8): DemoCollection[] {
  if (providers.length === 0) return [];
  const reviews = getDemoReviews();
  const reviewOrder = new Map<string, string>();
  reviews.forEach((r) => {
    if (!reviewOrder.has(r.provider_slug)) reviewOrder.set(r.provider_slug, r.created_at);
  });

  const byScore = [...providers].sort((a, b) => (b.marketplace_score ?? 0) - (a.marketplace_score ?? 0));
  const byBookings = [...providers].sort((a, b) => (b.completed_bookings ?? 0) - (a.completed_bookings ?? 0));
  const byRating = [...providers].sort(
    (a, b) => b.average_rating - a.average_rating || b.total_reviews - a.total_reviews,
  );
  const byResponse = [...providers].sort(
    (a, b) => (a.avg_response_minutes ?? 999) - (b.avg_response_minutes ?? 999),
  );
  const byNewest = [...providers].sort((a, b) => b.member_since.localeCompare(a.member_since));
  const byRecentReview = [...providers].sort((a, b) =>
    (reviewOrder.get(b.provider_slug) ?? "").localeCompare(reviewOrder.get(a.provider_slug) ?? ""),
  );
  const byFavorites = [...providers].sort(
    (a, b) => getDemoFavoriteCount(b.provider_slug) - getDemoFavoriteCount(a.provider_slug),
  );

  return [
    { id: "featured", title: "Udvalgte cleanere", subtitle: "Håndplukkede profiler med topresultater", providers: take(byScore, limit) },
    { id: "most_booked", title: "Mest bookede", subtitle: "De travleste profiler på platformen", providers: take(byBookings, limit) },
    { id: "top_rated", title: "Højest bedømte", subtitle: "Bedømt af rigtige kunder", providers: take(byRating, limit) },
    { id: "fast_response", title: "Hurtigst svar", subtitle: "Svarer typisk inden for få minutter", providers: take(byResponse, limit) },
    { id: "new_this_week", title: "Nye denne uge", subtitle: "Nye profiler i dit område", providers: take(byNewest, limit) },
    { id: "recently_reviewed", title: "Netop anmeldt", subtitle: "Friske anmeldelser fra de seneste dage", providers: take(byRecentReview, limit) },
    { id: "recommended_near_you", title: "Anbefalet i nærheden", subtitle: "Populære valg blandt kunder som dig", providers: take(byFavorites, limit) },
  ];
}

export function buildDemoTrendingServices(): DemoTrendingService[] {
  const rng = mulberry32(hashSeed("mycleaner-demo-trending"));
  const counts = new Map<string, number>();
  getDemoBookings().forEach((b) => counts.set(b.service_type, (counts.get(b.service_type) ?? 0) + 1));
  return [...counts.entries()]
    .map(([service, count]) => ({
      service,
      bookings_last_7_days: Math.max(3, Math.round(count * (0.8 + rng() * 0.8))),
      change_pct: Math.round((rng() * 48 - 8) * 10) / 10,
    }))
    .sort((a, b) => b.bookings_last_7_days - a.bookings_last_7_days);
}
