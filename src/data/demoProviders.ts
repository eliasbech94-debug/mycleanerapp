import type { MarketplaceProvider } from "@/hooks/useMarketplaceProviders";

/**
 * Demo providers — HOMEPAGE PRESENTATION ONLY.
 *
 * Rendered as a visual placeholder when no real providers match the
 * active market so the homepage never appears empty. These entries are
 * never bookable: their slugs point at `#` and BookingSidebar / checkout
 * ignore them. Do not import into Marketplace, FindCleaner, or any
 * server-side path.
 */
export const DEMO_PROVIDERS: MarketplaceProvider[] = [
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

export const isDemoProviderSlug = (slug: string) => slug.startsWith("demo-");
