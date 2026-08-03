import { DEMO_PROVIDER_FIXTURES } from "./providers";
import { getDemoCustomers } from "./customers";
import { addDays, addMinutes, chance, DEMO_NOW, hashSeed, intBetween, lazy, mulberry32, pick } from "./random";

/** Demo bookings + timelines — development / preview only. */
export type DemoBookingStatus =
  | "completed"
  | "upcoming"
  | "accepted"
  | "pending"
  | "cancelled"
  | "rescheduled";

export type DemoTimelineStep =
  | "accepted"
  | "travelling"
  | "arrived"
  | "started"
  | "paused"
  | "resumed"
  | "completed"
  | "customer_confirmed"
  | "funds_released";

export type DemoTimelineEntry = { step: DemoTimelineStep; at: string; label: string };

export type DemoBooking = {
  id: string;
  reference: string;
  provider_slug: string;
  provider_name: string;
  provider_avatar: string;
  customer_id: string;
  customer_name: string;
  customer_avatar: string;
  status: DemoBookingStatus;
  service_type: string;
  address_label: string;
  city: string;
  country_code: string;
  scheduled_at: string;
  duration_minutes: number;
  hourly_rate_minor: number;
  total_minor: number;
  currency: string;
  created_at: string;
  cancelled_reason: string | null;
  rescheduled_from: string | null;
  timeline: DemoTimelineEntry[];
};

const SERVICES = [
  "Home Cleaning",
  "Deep Cleaning",
  "Airbnb Cleaning",
  "Move-out Cleaning",
  "Office Cleaning",
  "Window Cleaning",
];

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  DK: "DKK",
  SE: "SEK",
  GB: "GBP",
  DE: "EUR",
  ES: "EUR",
};

const STREETS = [
  "Nørrebrogade", "Vesterbrogade", "Amagerbrogade", "Havnegade",
  "Storgatan", "Kungsgatan", "Södra Vägen",
  "Baker Street", "Camden Road", "Kings Road",
  "Friedrichstraße", "Kastanienallee", "Schanzenstraße",
  "Calle Mayor", "Carrer de Sants", "Gran Vía",
];

const CANCEL_REASONS = [
  "Kunden aflyste — rejste bort",
  "Provider var syg",
  "Adressen var ikke tilgængelig",
  "Kunden ombookte til en anden dato",
  "Betaling gennemførtes ikke",
];

const STEP_LABELS: Record<DemoTimelineStep, string> = {
  accepted: "Booking accepteret",
  travelling: "På vej",
  arrived: "Ankommet",
  started: "Opgave startet",
  paused: "Pause",
  resumed: "Genoptaget",
  completed: "Opgave afsluttet",
  customer_confirmed: "Kunden har bekræftet",
  funds_released: "Beløb frigivet",
};

const buildCompletedTimeline = (rng: () => number, scheduled: Date, duration: number): DemoTimelineEntry[] => {
  const entries: DemoTimelineEntry[] = [];
  const push = (step: DemoTimelineStep, at: Date) =>
    entries.push({ step, at: at.toISOString(), label: STEP_LABELS[step] });

  push("accepted", addMinutes(scheduled, -intBetween(rng, 60 * 6, 60 * 96)));
  const travelling = addMinutes(scheduled, -intBetween(rng, 15, 45));
  push("travelling", travelling);
  const arrived = addMinutes(scheduled, -intBetween(rng, 0, 6));
  push("arrived", arrived);
  const started = addMinutes(arrived, intBetween(rng, 2, 9));
  push("started", started);

  let end = addMinutes(started, duration);
  if (chance(rng, 0.28)) {
    const paused = addMinutes(started, Math.floor(duration * 0.5));
    push("paused", paused);
    const resumed = addMinutes(paused, intBetween(rng, 8, 25));
    push("resumed", resumed);
    end = addMinutes(resumed, Math.ceil(duration * 0.5));
  }
  push("completed", end);
  const confirmed = addMinutes(end, intBetween(rng, 5, 240));
  push("customer_confirmed", confirmed);
  push("funds_released", addMinutes(confirmed, intBetween(rng, 30, 60 * 26)));
  return entries;
};

export const DEMO_BOOKING_COUNT = 120;

const STATUS_MIX: DemoBookingStatus[] = [
  ...Array<DemoBookingStatus>(58).fill("completed"),
  ...Array<DemoBookingStatus>(22).fill("upcoming"),
  ...Array<DemoBookingStatus>(14).fill("accepted"),
  ...Array<DemoBookingStatus>(12).fill("pending"),
  ...Array<DemoBookingStatus>(9).fill("cancelled"),
  ...Array<DemoBookingStatus>(5).fill("rescheduled"),
];

export const getDemoBookings = lazy<DemoBooking[]>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-bookings"));
  const customers = getDemoCustomers();
  const providers = DEMO_PROVIDER_FIXTURES;
  const rows: DemoBooking[] = [];

  for (let i = 0; i < DEMO_BOOKING_COUNT; i += 1) {
    const provider = providers[i % providers.length];
    const customer = pick(rng, customers);
    const status = STATUS_MIX[i % STATUS_MIX.length];
    const duration = pick(rng, [90, 120, 150, 180, 240]);
    const rate = (provider.price_from ?? 300) * 100;
    const future = status === "upcoming" || status === "accepted" || status === "pending" || status === "rescheduled";
    const scheduled = future
      ? addDays(DEMO_NOW, intBetween(rng, 1, 34))
      : addDays(DEMO_NOW, -intBetween(rng, 1, 360));
    scheduled.setHours(intBetween(rng, 8, 16), pick(rng, [0, 30]), 0, 0);

    const timeline: DemoTimelineEntry[] =
      status === "completed"
        ? buildCompletedTimeline(rng, scheduled, duration)
        : status === "accepted" || status === "upcoming"
          ? [
              {
                step: "accepted",
                at: addDays(scheduled, -intBetween(rng, 1, 6)).toISOString(),
                label: STEP_LABELS.accepted,
              },
            ]
          : [];

    rows.push({
      id: `demo-booking-${i + 1}`,
      reference: `MC-${(100000 + i * 37).toString().slice(0, 6)}`,
      provider_slug: provider.provider_slug,
      provider_name: provider.display_name,
      provider_avatar: provider.avatar_url ?? "",
      customer_id: customer.id,
      customer_name: customer.display_name,
      customer_avatar: customer.avatar_url,
      status,
      service_type: pick(rng, SERVICES),
      address_label: `${pick(rng, STREETS)} ${intBetween(rng, 1, 180)}`,
      city: provider.city,
      country_code: provider.country_code ?? "DK",
      scheduled_at: scheduled.toISOString(),
      duration_minutes: duration,
      hourly_rate_minor: rate,
      total_minor: Math.round((rate * duration) / 60),
      currency: CURRENCY_BY_COUNTRY[provider.country_code ?? "DK"] ?? "DKK",
      created_at: addDays(scheduled, -intBetween(rng, 2, 20)).toISOString(),
      cancelled_reason: status === "cancelled" ? pick(rng, CANCEL_REASONS) : null,
      rescheduled_from: status === "rescheduled" ? addDays(scheduled, -intBetween(rng, 2, 9)).toISOString() : null,
      timeline,
    });
  }

  return rows.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
});

export const getDemoBookingsForProvider = (slug: string) =>
  getDemoBookings().filter((b) => b.provider_slug === slug);

export const getDemoBookingsForCustomer = (customerId: string) =>
  getDemoBookings().filter((b) => b.customer_id === customerId);

export const getUpcomingDemoBookings = (limit = 5) =>
  getDemoBookings()
    .filter((b) => b.status === "upcoming" || b.status === "accepted")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, limit);
