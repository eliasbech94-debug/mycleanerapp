/**
 * MyCleaner calendar status design system.
 *
 * SINGLE source of truth for how every calendar entity is rendered across the
 * week view, day view, month view, mobile agenda, event cards, detail panel,
 * filters and legends.
 *
 * Rules:
 * - status is never communicated by colour alone — every entry has an icon and
 *   a text label,
 * - colours come from `--cal-*` design tokens in index.css (no hardcoded hex),
 * - the same key is reused everywhere, so no component invents its own mapping.
 */
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BadgeCheck,
  Ban,
  Banknote,
  Bike,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Coffee,
  Hourglass,
  Lock,
  MapPin,
  Pause,
  Play,
  Plane,
  Stethoscope,
  Wallet,
  Wrench,
} from "lucide-react";

export type CalendarStatusKey =
  // booking lifecycle
  | "pending"
  | "accepted"
  | "travelling"
  | "arrived"
  | "work_started"
  | "paused"
  | "resumed"
  | "completed"
  | "awaiting_customer_confirmation"
  | "customer_confirmed"
  | "hold_active"
  | "funds_released"
  | "payout_scheduled"
  | "paid"
  | "cancelled"
  | "declined"
  // calendar blocks
  | "time_block"
  | "day_off"
  | "vacation"
  | "sick_leave"
  | "external"
  | "private_job";

export type CalendarStatusStyle = {
  /** `--cal-*` token stem, e.g. "pending" -> --cal-pending / --cal-pending-ink */
  token: string;
  label: string;
  icon: LucideIcon;
  /** Short label for dense surfaces (month cells, narrow week columns). */
  short: string;
};

export const CALENDAR_STATUS: Record<CalendarStatusKey, CalendarStatusStyle> = {
  pending: { token: "pending", label: "Afventer svar", short: "Anmodning", icon: Hourglass },
  accepted: { token: "accepted", label: "Accepteret", short: "Booking", icon: CheckCircle2 },
  travelling: { token: "travelling", label: "På vej", short: "På vej", icon: Bike },
  arrived: { token: "arrived", label: "Ankommet", short: "Ankommet", icon: MapPin },
  work_started: { token: "working", label: "I gang", short: "I gang", icon: Wrench },
  paused: { token: "paused", label: "På pause", short: "Pause", icon: Pause },
  resumed: { token: "resumed", label: "Genoptaget", short: "Genoptaget", icon: Play },
  completed: { token: "completed", label: "Afsluttet", short: "Afsluttet", icon: BadgeCheck },
  awaiting_customer_confirmation: {
    token: "awaiting",
    label: "Afventer kundens bekræftelse",
    short: "Afventer kunde",
    icon: Clock,
  },
  customer_confirmed: {
    token: "confirmed",
    label: "Bekræftet af kunden",
    short: "Bekræftet",
    icon: CheckCircle2,
  },
  hold_active: { token: "hold", label: "Beløb tilbageholdt", short: "Hold", icon: Lock },
  funds_released: { token: "released", label: "Beløb frigivet", short: "Frigivet", icon: Banknote },
  payout_scheduled: {
    token: "payout",
    label: "Udbetaling planlagt",
    short: "Udbetaling",
    icon: Wallet,
  },
  paid: { token: "paid", label: "Udbetalt", short: "Udbetalt", icon: CircleDollarSign },
  cancelled: { token: "cancelled", label: "Aflyst", short: "Aflyst", icon: Ban },
  declined: { token: "declined", label: "Afvist", short: "Afvist", icon: AlertCircle },
  time_block: { token: "block", label: "Blokeret tid", short: "Blokeret", icon: CalendarOff },
  day_off: { token: "block", label: "Fridag", short: "Fridag", icon: Coffee },
  vacation: { token: "vacation", label: "Ferie", short: "Ferie", icon: Plane },
  sick_leave: { token: "sick", label: "Sygdom", short: "Sygdom", icon: Stethoscope },
  external: {
    token: "external",
    label: "Ekstern kalender",
    short: "Ekstern",
    icon: CalendarDays,
  },
  private_job: { token: "private", label: "Privat opgave", short: "Privat", icon: Lock },
};

/** Inline style for a status surface (soft background + accessible ink). */
export function statusSurface(key: CalendarStatusKey, opacity = 0.14) {
  const { token } = CALENDAR_STATUS[key];
  return {
    backgroundColor: `hsl(var(--cal-${token}) / ${opacity})`,
    color: `hsl(var(--cal-${token}-ink))`,
    borderColor: `hsl(var(--cal-${token}) / 0.4)`,
  } as const;
}

/** Solid accent (left rail on event cards, month dots, legend swatches). */
export function statusAccent(key: CalendarStatusKey) {
  return `hsl(var(--cal-${CALENDAR_STATUS[key].token}))`;
}

/** Map a booking row to its calendar status key. */
export function bookingStatusKey(booking: {
  lifecycle_state?: string | null;
  status?: string | null;
}): CalendarStatusKey {
  const raw = booking.lifecycle_state || booking.status || "pending";
  return (raw in CALENDAR_STATUS ? raw : "pending") as CalendarStatusKey;
}
