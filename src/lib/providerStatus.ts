/**
 * Provider Live Status — presentation layer only.
 *
 * The database owns availability (working hours, calendar blocks, vacation,
 * sickness, booking lifecycle). This module only maps the single row returned
 * by `get_provider_live_status_v1` into one status, one label and one helpful
 * Danish message. No scheduling logic lives here.
 */
import {
  resolvePresence,
  type PresenceInfo,
  type PresenceLocale,
} from "@/lib/providerPresence";

export type ProviderStatusKey =
  | "vacation"
  | "unavailable"
  | "travelling"
  | "busy"
  | "available"
  | "off_hours";

export type ProviderLiveStatusRow = {
  provider_user_id: string;
  provider_slug: string | null;
  status: string;
  active_until: string | null;
  next_available_at: string | null;
  timezone: string | null;
  /** Coarse presence bucket from the server (never an exact timestamp). */
  presence_state?: string | null;
  /** Whole minutes since last app activity, null when older than 60 minutes. */
  presence_minutes?: number | null;
};

export type ProviderLiveStatus = {
  status: ProviderStatusKey;
  /** Short label shown in the pill, e.g. "Tilgængelig nu". */
  label: string;
  /** Helper line under the pill, e.g. "Ledig i morgen kl. 08:00". */
  message: string | null;
  /** ISO timestamp of the next bookable moment (null when unknown). */
  nextAvailable: string | null;
  /** 1 = highest. Only the highest priority status is ever displayed. */
  priority: number;
  emoji: string;
  /** Supporting app-activity info. Never overrides `status`. */
  presence: PresenceInfo;
};

/** Resolution order — never render more than one of these. */
export const STATUS_PRIORITY: Record<ProviderStatusKey, number> = {
  vacation: 1,
  unavailable: 2,
  travelling: 3,
  busy: 4,
  available: 5,
  off_hours: 6,
};

export const STATUS_META: Record<
  ProviderStatusKey,
  { label: string; emoji: string; dot: string; pill: string; longLabel?: string }
> = {
  vacation: {
    label: "Holder ferie",
    emoji: "🌴",
    dot: "bg-amber-500",
    pill: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  },
  unavailable: {
    label: "Midlertidigt utilgængelig",
    emoji: "🔴",
    dot: "bg-rose-500",
    pill: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  },
  travelling: {
    label: "På vej",
    longLabel: "På vej til kunde",
    emoji: "🚗",
    dot: "bg-sky-500",
    pill: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  },
  busy: {
    label: "Optaget",
    emoji: "🟡",
    dot: "bg-yellow-500",
    pill: "bg-yellow-500/10 text-yellow-700 ring-yellow-500/25 dark:text-yellow-300",
  },
  available: {
    label: "Tilgængelig nu",
    emoji: "🟢",
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  },
  off_hours: {
    label: "Uden for arbejdstid",
    emoji: "⚪",
    dot: "bg-slate-400",
    pill: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300",
  },
};

const WEEKDAYS = [
  "søndag",
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
];

const MONTHS = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clock(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "den 18. august" */
export function formatDanishDate(d: Date): string {
  return `den ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** "Ledig igen i dag kl. 15:30" / "Ledig i morgen kl. 08:00" / "Ledig mandag kl. 09:00" */
export function formatNextAvailable(next: Date, now = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(next, now)) return `Ledig igen i dag kl. ${clock(next)}`;
  if (sameDay(next, tomorrow)) return `Ledig i morgen kl. ${clock(next)}`;
  const days = Math.round((next.getTime() - now.getTime()) / 86400000);
  if (days <= 6) return `Ledig ${WEEKDAYS[next.getDay()]} kl. ${clock(next)}`;
  return `Ledig ${formatDanishDate(next)} kl. ${clock(next)}`;
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

function normaliseStatus(value: string): ProviderStatusKey {
  return (Object.keys(STATUS_PRIORITY) as ProviderStatusKey[]).includes(
    value as ProviderStatusKey,
  )
    ? (value as ProviderStatusKey)
    : "off_hours";
}

/**
 * Maps one server row to the single status the UI renders.
 * `now` is injectable so the formatting is testable.
 */
export function resolveProviderStatus(
  row: ProviderLiveStatusRow | null | undefined,
  now = new Date(),
  locale: PresenceLocale = "da",
): ProviderLiveStatus | null {
  if (!row) return null;
  const status = normaliseStatus(row.status);
  const meta = STATUS_META[status];
  const presence = resolvePresence(row.presence_state, row.presence_minutes, locale);
  const next = parse(row.next_available_at);
  const until = parse(row.active_until);

  let message: string | null = null;
  if (status === "vacation") {
    const back = until ?? next;
    message = back ? `Tilbage fra ferie ${formatDanishDate(back)}` : null;
  } else if (status === "travelling") {
    message = "På vej til kunde";
  } else if (status === "available") {
    message = null;
  } else if (next) {
    message = formatNextAvailable(next, now);
  }

  return {
    status,
    label: meta.label,
    emoji: meta.emoji,
    message,
    nextAvailable: row.next_available_at,
    priority: STATUS_PRIORITY[status],
    presence,
  };
}
