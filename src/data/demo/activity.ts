import { DEMO_PROVIDER_FIXTURES } from "./providers";
import { getDemoBookingsForProvider } from "./bookings";
import { getDemoReviewsForProvider } from "./reviews";
import { addDays, chance, DEMO_NOW, hashSeed, intBetween, lazy, mulberry32, pick } from "./random";
import { getDemoCustomers } from "./customers";

/** Provider gallery, video-intro badges, favorites, notifications and dashboard stats. */

export type DemoGalleryImage = {
  id: string;
  url: string;
  kind: "before" | "after" | "equipment" | "workspace" | "result";
  caption: string;
};

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=675&q=80`;

const GALLERY_POOL: Omit<DemoGalleryImage, "id">[] = [
  { url: IMG("photo-1581578731548-c64695cc6952"), kind: "equipment", caption: "Mit faste udstyr" },
  { url: IMG("photo-1585421514738-01798e348b17"), kind: "equipment", caption: "Miljøvenlige produkter" },
  { url: IMG("photo-1527515637462-cff94eecc1ac"), kind: "before", caption: "Køkken før" },
  { url: IMG("photo-1556911220-bff31c812dba"), kind: "after", caption: "Køkken efter" },
  { url: IMG("photo-1600585154340-be6161a56a0c"), kind: "result", caption: "Færdigt resultat" },
  { url: IMG("photo-1584622650111-993a426fbf0a"), kind: "before", caption: "Badeværelse før" },
  { url: IMG("photo-1620626011761-996317b8d101"), kind: "after", caption: "Badeværelse efter" },
  { url: IMG("photo-1522708323590-d24dbb6b0267"), kind: "result", caption: "Stue efter hovedrengøring" },
  { url: IMG("photo-1497366754035-f200968a6e72"), kind: "workspace", caption: "Kontorrengøring" },
  { url: IMG("photo-1567767292278-a4f21aa2d36e"), kind: "workspace", caption: "Klar til nye gæster" },
];

export const getDemoGallery = lazy<Record<string, DemoGalleryImage[]>>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-gallery"));
  const map: Record<string, DemoGalleryImage[]> = {};
  DEMO_PROVIDER_FIXTURES.forEach((provider, index) => {
    if (index % 3 === 2 && !provider.showcase) return; // not every provider has a gallery
    const count = intBetween(rng, 4, 8);
    map[provider.provider_slug] = Array.from({ length: count }, (_, i) => {
      const base = GALLERY_POOL[(index * 3 + i) % GALLERY_POOL.length];
      return { ...base, id: `demo-gallery-${provider.provider_slug}-${i + 1}` };
    });
  });
  return map;
});

export const getDemoGalleryForProvider = (slug: string): DemoGalleryImage[] =>
  getDemoGallery()[slug] ?? [];

/** ~8 providers advertise a video introduction (UI only — no media files yet). */
export const getDemoVideoIntroSlugs = lazy<string[]>(() => {
  const flagged = DEMO_PROVIDER_FIXTURES.filter((p) => p.badges.includes("video_intro")).map(
    (p) => p.provider_slug,
  );
  if (flagged.length >= 8) return flagged.slice(0, 8);
  const extra = DEMO_PROVIDER_FIXTURES.filter((p) => !flagged.includes(p.provider_slug))
    .slice(0, 8 - flagged.length)
    .map((p) => p.provider_slug);
  return [...flagged, ...extra];
});

export const hasDemoVideoIntro = (slug: string) => getDemoVideoIntroSlugs().includes(slug);

/** Favorites: which customers saved which providers, plus per-provider counts. */
export type DemoFavorite = { customer_id: string; provider_slug: string; saved_at: string };

export const getDemoFavorites = lazy<DemoFavorite[]>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-favorites"));
  const rows: DemoFavorite[] = [];
  getDemoCustomers().forEach((customer) => {
    const count = chance(rng, 0.72) ? intBetween(rng, 1, 5) : 0;
    const seen = new Set<string>();
    for (let i = 0; i < count; i += 1) {
      const provider = pick(rng, DEMO_PROVIDER_FIXTURES);
      if (seen.has(provider.provider_slug)) continue;
      seen.add(provider.provider_slug);
      rows.push({
        customer_id: customer.id,
        provider_slug: provider.provider_slug,
        saved_at: addDays(DEMO_NOW, -intBetween(rng, 1, 400)).toISOString(),
      });
    }
  });
  return rows;
});

export const getDemoFavoritesForCustomer = (customerId: string) =>
  getDemoFavorites().filter((f) => f.customer_id === customerId);

export const getDemoFavoriteCount = (slug: string) => {
  const base = getDemoFavorites().filter((f) => f.provider_slug === slug).length;
  const provider = DEMO_PROVIDER_FIXTURES.find((p) => p.provider_slug === slug);
  // Scale to a believable public number without touching the underlying rows.
  return base * 9 + Math.round((provider?.total_reviews ?? 0) * 0.35);
};

/** Notifications. */
export type DemoNotificationKind =
  | "booking_accepted"
  | "new_review"
  | "booking_reminder"
  | "payment_released"
  | "message_received"
  | "profile_reminder";

export type DemoNotification = {
  id: string;
  kind: DemoNotificationKind;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  audience: "customer" | "provider";
  href: string | null;
};

const NOTIFICATION_TEMPLATES: Array<{
  kind: DemoNotificationKind;
  audience: "customer" | "provider";
  title: string;
  body: string;
  href: string | null;
}> = [
  { kind: "booking_accepted", audience: "customer", title: "Booking accepteret", body: "Din booking er bekræftet af din cleaner.", href: "/mine-bookinger" },
  { kind: "new_review", audience: "provider", title: "Ny anmeldelse", body: "Du har modtaget en ny 5-stjernet anmeldelse.", href: "/provider-dashboard" },
  { kind: "booking_reminder", audience: "customer", title: "Påmindelse", body: "Din rengøring starter i morgen kl. 10:00.", href: "/mine-bookinger" },
  { kind: "payment_released", audience: "provider", title: "Beløb frigivet", body: "Udbetalingen for din seneste opgave er på vej.", href: "/provider/finance" },
  { kind: "message_received", audience: "customer", title: "Ny besked", body: "Du har en ulæst besked i din indbakke.", href: "/inbox" },
  { kind: "profile_reminder", audience: "provider", title: "Færdiggør din profil", body: "Tilføj en beskrivelse for at få flere bookinger.", href: "/provider/profile" },
  { kind: "booking_reminder", audience: "provider", title: "Opgave i morgen", body: "Du har en opgave i morgen kl. 09:00 på Nørrebrogade.", href: "/provider-dashboard" },
  { kind: "new_review", audience: "customer", title: "Bedøm din cleaner", body: "Hvordan gik din seneste rengøring?", href: "/mine-bookinger" },
];

export const getDemoNotifications = lazy<DemoNotification[]>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-notifications"));
  return Array.from({ length: 36 }, (_, i) => {
    const template = NOTIFICATION_TEMPLATES[i % NOTIFICATION_TEMPLATES.length];
    return {
      id: `demo-notification-${i + 1}`,
      ...template,
      created_at: addDays(DEMO_NOW, -intBetween(rng, 0, 30)).toISOString(),
      read: chance(rng, 0.55),
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
});

export const getDemoNotificationsFor = (audience: "customer" | "provider", limit = 12) =>
  getDemoNotifications()
    .filter((n) => n.audience === audience)
    .slice(0, limit);

/** Provider dashboard statistics, derived from the booking + review fixtures. */
export type DemoProviderStats = {
  provider_slug: string;
  monthly_earnings_minor: number;
  currency: string;
  bookings_completed: number;
  hours_worked: number;
  average_rating: number;
  response_rate: number;
  repeat_customer_rate: number;
  upcoming_bookings: number;
  current_streak_days: number;
  earnings_trend: Array<{ month: string; amount_minor: number }>;
};

export const getDemoProviderStats = (slug: string): DemoProviderStats | null => {
  const provider = DEMO_PROVIDER_FIXTURES.find((p) => p.provider_slug === slug);
  if (!provider) return null;
  const rng = mulberry32(hashSeed(`stats-${slug}`));
  const bookings = getDemoBookingsForProvider(slug);
  const reviews = getDemoReviewsForProvider(slug);
  const completed = bookings.filter((b) => b.status === "completed");
  const hours = completed.reduce((sum, b) => sum + b.duration_minutes, 0) / 60;
  const currency = completed[0]?.currency ?? "DKK";
  const monthly = completed.reduce((sum, b) => sum + b.total_minor, 0) || (provider.price_from ?? 300) * 100 * 42;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(DEMO_NOW, -30 * (5 - i));
    return {
      month: d.toISOString().slice(0, 7),
      amount_minor: Math.round(monthly * (0.7 + rng() * 0.6)),
    };
  });

  return {
    provider_slug: slug,
    monthly_earnings_minor: months[months.length - 1].amount_minor,
    currency,
    bookings_completed: provider.completed_bookings ?? completed.length,
    hours_worked: Math.round(hours + (provider.completed_bookings ?? 0) * 1.8),
    average_rating:
      reviews.length > 0
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
        : provider.average_rating,
    response_rate: provider.response_rate,
    repeat_customer_rate: intBetween(rng, 38, 82),
    upcoming_bookings: bookings.filter((b) => b.status === "upcoming" || b.status === "accepted").length,
    current_streak_days: intBetween(rng, 3, 64),
    earnings_trend: months,
  };
};
