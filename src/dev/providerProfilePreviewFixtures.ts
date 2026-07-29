/**
 * DEVELOPMENT PREVIEW FIXTURES — never imported by production code paths.
 *
 * These objects are typed as the real DB models (`PublicProviderProfile`,
 * `PublicWorkHistoryEntry`, `PublicReview`, `Slot`) and flow through the same
 * normalisation (`activeServices`, `deriveAvailabilityStatus`, …) as live data.
 * They exist solely so /dev/provider-profile-preview can be validated visually
 * without writing test data to any database.
 */
import type {
  PublicProviderProfile,
  PublicReview,
  PublicWorkHistoryEntry,
  Slot,
} from "@/components/provider/public/types";

export type PreviewCaseId = "a" | "b" | "c";

export type PreviewCase = {
  id: PreviewCaseId;
  label: string;
  description: string;
  profile: PublicProviderProfile;
  workHistory: PublicWorkHistoryEntry[];
  reviews: PublicReview[];
  slots: Slot[];
  nextSlot: Slot | null;
  distanceKm: number | null;
};

const BASE: PublicProviderProfile = {
  provider_slug: "preview", display_name: "", avatar_url: null, marketplace_score: null,
  provider_tier: "new", country_code: "DK", city: null, approx_lat: null, approx_lng: null,
  service_categories: [], languages: [], years_experience: null, price_from: null,
  service_radius_km: null, public_bio: null, headline: null, equipment_badges: null,
  avg_response_minutes: null, identity_verified_badge: false, address_verified: false,
  average_rating: null, total_reviews: null, completed_bookings: 0, years_on_platform: 0,
  insurance_valid: false, services: [],
};

const day = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

const slots = (days: number[], hours: number[]): Slot[] =>
  days.flatMap((d) => hours.map((h) => ({ slot_date: day(d), slot_hour: h })));

/** Case A — brand new provider: minimal data, most sections must hide. */
const CASE_A: PreviewCase = {
  id: "a",
  label: "A · Ny provider",
  description: "Kort navn, foto, by, 1 service, 1 badge, ingen anmeldelser eller historik.",
  profile: {
    ...BASE,
    provider_slug: "preview-a",
    display_name: "Li Wang",
    avatar_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&q=70",
    city: "Aarhus",
    identity_verified_badge: true,
    public_bio: "Jeg er ny på MyCleaner og glæder mig til mine første opgaver.",
    services: [
      { service_code: "cleaning", amount_minor: 25000, currency: "DKK", unit: "hour" },
      { service_code: "ironing", amount_minor: 22000, currency: "DKK", unit: "hour" },
    ],
  },
  workHistory: [],
  reviews: [],
  slots: [],
  nextSlot: null,
  distanceKm: null,
};

/** Case B — experienced provider: every section populated. */
const CASE_B: PreviewCase = {
  id: "b",
  label: "B · Erfaren provider",
  description: "Rating, 6 services med 3 prisformer, 6 badges, verificeret historik, 4 sprog, ledige tider.",
  profile: {
    ...BASE,
    provider_slug: "preview-b",
    display_name: "Sofia Marquez",
    avatar_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&q=70",
    city: "København",
    provider_tier: "top_rated",
    marketplace_score: 96,
    identity_verified_badge: true,
    address_verified: true,
    insurance_valid: true,
    equipment_badges: { mycleaner_test: true, background_check: true, professional_certificate: true },
    average_rating: 4.9,
    total_reviews: 128,
    completed_bookings: 412,
    years_experience: 12,
    years_on_platform: 3,
    languages: ["da", "en", "es", "pl"],
    headline: "Erfaren rengøringsekspert med øje for detaljen",
    public_bio:
      "Jeg har rengjort private hjem og kontorer i København i 12 år. Jeg arbejder systematisk, bruger allergivenlige midler og efterlader altid en kort besked om, hvad jeg har haft ekstra fokus på. Faste kunder får samme rutine hver gang.",
    services: [
      { service_code: "cleaning", amount_minor: 29500, currency: "DKK", price_model: "hourly", is_active: true, min_duration_minutes: 120 },
      { service_code: "deep_cleaning", amount_minor: 39500, currency: "DKK", price_model: "hourly", is_active: true },
      { service_code: "office_cleaning", amount_minor: 45000, currency: "DKK", price_model: "hourly", is_active: true },
      { service_code: "moveout_cleaning", amount_minor: 149500, currency: "DKK", price_model: "from", is_active: true, surcharges: [{ label: "Weekend", percent: 25 }] },
      { service_code: "window_cleaning", amount_minor: 32000, currency: "DKK", price_model: "fixed", is_active: true },
      { service_code: "ironing", amount_minor: 24000, currency: "DKK", price_model: "hourly", is_active: true },
      { service_code: "laundry", amount_minor: 21000, currency: "DKK", price_model: "hourly", is_active: false },
    ],
  },
  workHistory: [
    { company_name: "ISS Facility Services", role_title: "Teamleder", city: "København", started_on: "2018-01-01", ended_on: "2022-01-01", currently_employed: false },
    { company_name: "Coor", role_title: "Servicemedarbejder", city: "København", started_on: "2022-02-01", ended_on: null, currently_employed: true },
  ],
  reviews: [
    { id: "r1", rating: 5, comment: "Super grundig og altid til tiden. Vores lejlighed har aldrig været renere.", reviewer_first_name: "Mette", reviewer_city: "Frederiksberg", created_at: "2026-06-02" },
    { id: "r2", rating: 5, comment: "Nem at kommunikere med og meget fleksibel.", reviewer_first_name: "Jonas", reviewer_city: "København", created_at: "2026-05-18" },
    { id: "r3", rating: 4, comment: "Godt arbejde – kom 10 minutter for sent, men gav besked.", reviewer_first_name: "Amira", reviewer_city: "Valby", created_at: "2026-05-04" },
  ],
  slots: slots([0, 1, 2, 4, 5, 7, 8], [8, 10, 12, 14, 16]),
  nextSlot: null,
  distanceKm: 3.2,
};

const LONG_NAME = "Alexandra-Katharina von Hohenzollern-Sigmaringen";
const LONG_SERVICES = [
  "premium_dybderengoering_med_allergivenlige_midler",
  "erhvervsrengoering_kontor_og_faellesarealer",
  "flytterengoering_med_afleveringsgaranti",
  "vinduespudsning_indvendigt_og_udvendigt",
  "trappevask_og_opgangsrengoering",
  "hovedrengoering_efter_haandvaerkere",
  "strygning_og_toejpleje",
  "koeleskabs_og_ovnrengoering",
  "sommerhusrengoering_med_linnedskift",
];

/** Case C — extreme content: nothing may overflow or overlap. */
const CASE_C: PreviewCase = {
  id: "c",
  label: "C · Ekstrem layout",
  description: "Meget langt navn, lang headline og bio, 9 services med lange navne og priser, 10 sprog, 4 arbejdsgivere.",
  profile: {
    ...BASE,
    provider_slug: "preview-c",
    display_name: LONG_NAME,
    avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=70",
    city: "Frederiksberg",
    provider_tier: "elite",
    marketplace_score: 88,
    identity_verified_badge: true,
    address_verified: true,
    insurance_valid: true,
    equipment_badges: { mycleaner_test: true, background_check: true, professional_certificate: true },
    average_rating: 4.75,
    total_reviews: 1043,
    completed_bookings: 2841,
    years_experience: 21,
    languages: ["da", "en", "de", "es", "fr", "pl", "ro", "ar", "sv", "no"],
    headline:
      "Certificeret rengøringsspecialist med fokus på allergivenlig dybderengøring, erhvervsaftaler og flytterengøring i hele hovedstadsområdet",
    public_bio:
      "Jeg arbejder grundigt, systematisk og altid efter en aftalt tjekliste. ".repeat(12),
    services: LONG_SERVICES.map((code, i) => ({
      service_code: code,
      amount_minor: 1249500 + i * 100000,
      currency: "DKK",
      price_model: (i % 3 === 0 ? "from" : i % 3 === 1 ? "hourly" : "fixed") as "from" | "hourly" | "fixed",
      is_active: true,
      min_duration_minutes: 180,
      surcharges: [{ label: "Aften og weekend", percent: 35 }],
    })),
  },
  workHistory: [
    { company_name: "ISS Facility Services Danmark A/S", role_title: "Kvalitetsansvarlig serviceleder", city: "København", started_on: "2005-01-01", ended_on: "2011-01-01", currently_employed: false },
    { company_name: "Coor Service Management", role_title: "Teamkoordinator", city: "Frederiksberg", started_on: "2011-02-01", ended_on: "2017-06-01", currently_employed: false },
    { company_name: "Forenede Service", role_title: "Specialist i hospitalsrengøring", city: "Hvidovre", started_on: "2017-07-01", ended_on: "2023-03-01", currently_employed: false },
    { company_name: "Selvstændig", role_title: "Indehaver", city: "Frederiksberg", started_on: "2023-04-01", ended_on: null, currently_employed: true },
  ],
  reviews: [
    { id: "r1", rating: 5, comment: "Grundigste rengøring vi nogensinde har fået — og hun dokumenterede hvert rum med billeder bagefter, hvilket gjorde afleveringen af lejligheden helt problemfri.", reviewer_first_name: "Christoffer-Emil", reviewer_city: "København Ø", created_at: "2026-07-01" },
    { id: "r2", rating: 4, comment: null, reviewer_first_name: null, reviewer_city: null, created_at: "2026-06-11" },
  ],
  slots: slots([1, 3, 6, 9, 11, 13], [7, 9, 11, 13, 15, 17, 19]),
  nextSlot: null,
  distanceKm: 12.4,
};

export const PREVIEW_CASES: PreviewCase[] = [CASE_A, CASE_B, CASE_C];
