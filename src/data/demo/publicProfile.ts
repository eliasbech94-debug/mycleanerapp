/**
 * Demo adapter for the PUBLIC provider profile (/p/:slug).
 *
 * Development / preview only. Maps the existing demo fixtures onto the exact
 * shapes the public profile components already consume, so a demo slug renders
 * the full profile with zero Supabase queries, zero writes and zero network
 * calls. Production slugs never touch this file.
 */
import type {
  PublicProviderProfile,
  PublicReview,
  PublicWorkHistoryEntry,
  Slot,
} from "@/components/provider/public/types";
import type { DemoProvider } from "./providers";
import { getDemoReviewsForProvider } from "./reviews";
import demoIntroVideo from "@/assets/how-it-works-rate.mp4.asset.json";
import { addDays, chance, DEMO_NOW, hashSeed, intBetween, isoDay, mulberry32 } from "./random";

const LANGUAGE_CODES: Record<string, string> = {
  dansk: "da", danish: "da",
  engelsk: "en", english: "en", engelska: "en",
  svensk: "sv", svenska: "sv", swedish: "sv",
  norsk: "no", norwegian: "no",
  tysk: "de", deutsch: "de", german: "de",
  spansk: "es", español: "es", spanish: "es",
  fransk: "fr", french: "fr",
  polsk: "pl", polski: "pl", polish: "pl",
  rumænsk: "ro", romanian: "ro",
  arabisk: "ar", arabic: "ar",
  portugisisk: "pt", portuguese: "pt",
};

function languageCode(label: string): string {
  return LANGUAGE_CODES[label.trim().toLowerCase()] ?? label;
}

const SERVICE_CODES: Record<string, string> = {
  "home cleaning": "standard_cleaning",
  "deep cleaning": "deep_cleaning",
  "move-out cleaning": "moveout_cleaning",
  "moveout cleaning": "moveout_cleaning",
  "office cleaning": "office_cleaning",
  "window cleaning": "window_cleaning",
  "airbnb cleaning": "airbnb_cleaning",
  "after party cleaning": "party_cleaning",
  ironing: "ironing",
  laundry: "laundry",
};

function serviceCode(label: string): string {
  return SERVICE_CODES[label.trim().toLowerCase()] ?? label.trim().toLowerCase().replace(/\s+/g, "_");
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  DK: "DKK", SE: "SEK", NO: "NOK", GB: "GBP", DE: "EUR", ES: "EUR",
  NL: "EUR", FR: "EUR", PL: "PLN", IE: "EUR", FI: "EUR", IT: "EUR",
};

/** Full public profile row, shaped exactly like `get_public_provider_profile_v2`. */
export function toPublicProviderProfile(p: DemoProvider): PublicProviderProfile {
  const rng = mulberry32(hashSeed(`profile:${p.provider_slug}`));
  const currency = CURRENCY_BY_COUNTRY[p.country_code ?? "DK"] ?? "EUR";
  const base = p.price_from ?? 250;
  const hasVideo = p.badges.includes("video_intro");
  const yearsOnPlatform = Math.max(
    1,
    DEMO_NOW.getFullYear() - new Date(p.member_since).getFullYear(),
  );

  return {
    provider_slug: p.provider_slug,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    marketplace_score: p.marketplace_score,
    provider_tier: p.provider_tier,
    country_code: p.country_code,
    city: p.city,
    approx_lat: null,
    approx_lng: null,
    service_categories: p.service_categories,
    languages: p.languages.map(languageCode),
    years_experience: yearsOnPlatform + intBetween(rng, 0, 5),
    price_from: p.price_from,
    service_radius_km: p.service_radius_km,
    public_bio: p.public_bio,
    headline: p.services[0] ? `${p.services[0]} · ${p.city}` : null,
    equipment_badges: p.badges,
    avg_response_minutes: p.avg_response_minutes,
    identity_verified_badge: p.badges.includes("id_verified"),
    address_verified: p.badges.includes("background_checked"),
    average_rating: p.average_rating,
    total_reviews: p.total_reviews,
    completed_bookings: p.completed_bookings,
    years_on_platform: yearsOnPlatform,
    insurance_valid: p.badges.includes("pro_provider"),
    services: p.services.map((label, i) => ({
      service_code: serviceCode(label),
      amount_minor: Math.round((base + i * 25) * 100),
      currency,
      unit: "hour",
      price_model: "hourly" as const,
      min_duration_minutes: 120,
      is_active: true,
      description: null,
    })),
    intro_video: hasVideo
      ? {
          id: `demo-video-${p.provider_slug}`,
          videoUrl: demoIntroVideo.url,
          thumbnailUrl: p.cover_url,
          durationSeconds: intBetween(rng, 35, 75),
          status: "approved",
          recordedInMyCleaner: true,
          identityVerified: p.badges.includes("id_verified"),
          approvedAt: p.member_since,
          language: languageCode(p.languages[0] ?? "Dansk"),
        }
      : null,
    repeat_booking_rate: Math.min(0.95, p.response_rate / 100 - 0.05),
    mycleaner_recommended: p.badges.includes("top_rated"),
  };
}

/** Fictional, clearly demo-only employment history. */
export function toDemoWorkHistory(p: DemoProvider): PublicWorkHistoryEntry[] {
  const rng = mulberry32(hashSeed(`work:${p.provider_slug}`));
  const startYear = new Date(p.member_since).getFullYear();
  const entries: PublicWorkHistoryEntry[] = [
    {
      company_name: "MyCleaner",
      role_title: p.provider_kind === "company" ? "Rengøringsvirksomhed" : "Selvstændig cleaner",
      city: p.city,
      started_on: p.member_since,
      ended_on: null,
      currently_employed: true,
    },
  ];
  if (chance(rng, 0.7)) {
    entries.push({
      company_name: p.provider_kind === "company" ? "Facility Partner Nordic" : "Hotel Skandinavia",
      role_title: "Rengøringsassistent",
      city: p.city,
      started_on: `${startYear - intBetween(rng, 3, 6)}-03-01`,
      ended_on: `${startYear}-01-31`,
      currently_employed: false,
    });
  }
  return entries;
}

/** Reviews mapped onto the public review shape. */
export function toDemoPublicReviews(slug: string, limit = 5): PublicReview[] {
  return getDemoReviewsForProvider(slug, limit).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.body,
    reviewer_first_name: r.reviewer_name.split(" ")[0] ?? null,
    reviewer_city: null,
    created_at: r.created_at,
  }));
}

/** Deterministic bookable slots for the next 14 days. */
export function toDemoSlots(p: DemoProvider, fullyBooked = false): Slot[] {
  if (fullyBooked) return [];
  const rng = mulberry32(hashSeed(`slots:${p.provider_slug}`));
  const slots: Slot[] = [];
  for (let d = 1; d <= 14; d += 1) {
    const day = addDays(DEMO_NOW, d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    if (weekend && !chance(rng, 0.35)) continue;
    if (!chance(rng, 0.75)) continue;
    for (const hour of [8, 10, 12, 14, 16]) {
      if (chance(rng, 0.55)) slots.push({ slot_date: isoDay(day), slot_hour: hour });
    }
  }
  return slots;
}

/** Next slot beyond the 14-day window, used when the calendar is empty. */
export function toDemoNextSlot(p: DemoProvider): Slot {
  const rng = mulberry32(hashSeed(`next:${p.provider_slug}`));
  return { slot_date: isoDay(addDays(DEMO_NOW, intBetween(rng, 16, 45))), slot_hour: 10 };
}
