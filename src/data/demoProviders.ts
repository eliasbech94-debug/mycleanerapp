import type { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";

/**
 * Demo providers — **development / explicit demo mode only**.
 *
 * These are fictional cleaners used exclusively for local UI development
 * and design review. They must NEVER be rendered in staging or production
 * because they carry invented names, ratings, prices, and availability
 * that could mislead real customers.
 *
 * Gate: enabled when `import.meta.env.DEV` is true, or when the build
 * defines `VITE_ENABLE_DEMO_PROVIDERS === "true"`.
 */
const DEMO_PROVIDERS_INTERNAL: MarketplaceProvider[] = [
  {
    provider_slug: "demo-maria-silva",
    display_name: "Maria Silva",
    avatar_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&w=200&h=200&facepad=2.5&q=80",
    marketplace_score: 0.95,
    provider_tier: "pro",
    country_code: "DK",
    service_categories: ["cleaning"],
    price_from: 249,
    service_radius_km: 3,
    public_bio: "I provide high-quality cleaning with attention to detail. Punctual, reliable and experienced.",
    avg_response_minutes: 20,
    identity_verified_badge: true,
    average_rating: 4.9,
    total_reviews: 124,
    completed_bookings: 380,
    total_count: 3,
  },
  {
    provider_slug: "demo-anna-kowalska",
    display_name: "Anna Kowalska",
    avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=facearea&w=200&h=200&facepad=2.5&q=80",
    marketplace_score: 0.92,
    provider_tier: "pro",
    country_code: "DK",
    service_categories: ["cleaning"],
    price_from: 229,
    service_radius_km: 5,
    public_bio: "I love making homes shine, 5+ years of experience and many happy customers.",
    avg_response_minutes: 30,
    identity_verified_badge: true,
    average_rating: 4.8,
    total_reviews: 98,
    completed_bookings: 240,
    total_count: 3,
  },
  {
    provider_slug: "demo-michael-jensen",
    display_name: "Michael Jensen",
    avatar_url: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=facearea&w=200&h=200&facepad=2.5&q=80",
    marketplace_score: 0.9,
    provider_tier: "premium",
    country_code: "DK",
    service_categories: ["cleaning"],
    price_from: 279,
    service_radius_km: 2,
    public_bio: "Detail-oriented and efficient cleaner. I bring my own equipment and supplies.",
    avg_response_minutes: 15,
    identity_verified_badge: true,
    average_rating: 4.9,
    total_reviews: 156,
    completed_bookings: 512,
    total_count: 3,
  },
];

/** True only in development or when the demo flag is explicitly enabled. */
export function isDemoProvidersEnabled(): boolean {
  try {
    // Vite exposes DEV as a compile-time boolean; guard for non-Vite envs (tests).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env ?? {};
    if (env.DEV === true) return true;
    if (env.VITE_ENABLE_DEMO_PROVIDERS === "true") return true;
  } catch {
    /* noop */
  }
  return false;
}

/** Empty in staging/production; populated only when demo mode is on. */
export const DEMO_PROVIDERS: MarketplaceProvider[] = isDemoProvidersEnabled()
  ? DEMO_PROVIDERS_INTERNAL
  : [];

export const isDemoProviderSlug = (slug: string) => slug.startsWith("demo-");
