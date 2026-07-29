/**
 * Public provider profile — shared types.
 *
 * Every field here is loaded from the database at runtime. Nothing in the
 * public profile UI may hardcode provider content (names, prices, ratings,
 * cities, dates, images). Sections render only when their data exists so the
 * profile can grow (MyCleaner Score, certifications, portfolio, career
 * timeline, achievements…) without a redesign.
 */

/** How a provider prices a service. Mirrors provider_service_prices.price_model. */
export type ServicePriceModel = "hourly" | "fixed" | "from";

export type PublicProviderService = {
  service_code: string;
  amount_minor: number;
  currency: string;
  /** "hour" | "job" — legacy shape, defaults to hour when omitted. */
  unit?: string | null;
  /** provider_service_prices fields (optional until PR #36 is merged). */
  price_model?: ServicePriceModel | null;
  min_duration_minutes?: number | null;
  surcharges?: { label: string; amount_minor?: number | null; percent?: number | null }[] | null;
  is_active?: boolean | null;
};

export type PublicProviderProfile = {
  provider_slug: string;
  display_name: string;
  avatar_url: string | null;
  marketplace_score: number | null;
  provider_tier: string;
  country_code: string | null;
  city: string | null;
  approx_lat: number | null;
  approx_lng: number | null;
  service_categories: string[] | null;
  languages: string[] | null;
  years_experience: number | null;
  price_from: number | null;
  service_radius_km: number | null;
  public_bio: string | null;
  headline: string | null;
  equipment_badges: unknown;
  avg_response_minutes: number | null;
  identity_verified_badge: boolean;
  address_verified: boolean;
  average_rating: number | null;
  total_reviews: number | null;
  completed_bookings: number;
  years_on_platform: number;
  insurance_valid: boolean;
  services: PublicProviderService[] | null;
};

export type PublicWorkHistoryEntry = {
  company_name: string;
  role_title: string | null;
  city: string | null;
  started_on: string | null;
  ended_on: string | null;
  currently_employed: boolean | null;
};

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_first_name: string | null;
  reviewer_city: string | null;
  created_at: string | null;
};

export type Slot = { slot_date: string; slot_hour: number };

/**
 * Presence — REAL platform activity only (last_seen_at within 10 minutes).
 * `unknown` means we have no presence source yet; the UI hides "Online nu".
 */
export type PresenceStatus = "online" | "unknown";

/** Calendar-derived availability. Never rendered as "Online". */
export type AvailabilityStatus = "available" | "unavailable";
