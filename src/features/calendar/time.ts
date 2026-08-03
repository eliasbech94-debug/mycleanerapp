/**
 * Calendar time helpers.
 *
 * The provider calendar renders in the provider's own timezone as stored on
 * `provider_availability_rules.timezone`. Bookings carry `booking_date` +
 * `slot` (provider-local wall clock) + `hours`, so local Date construction is
 * the correct interpretation. No availability is ever derived here — the
 * database remains authoritative.
 */
export const WEEKDAY_LABELS = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"] as const;
export const WEEKDAY_LONG = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
] as const;

export const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const addDays = (d: Date, n: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

export const startOfDay = (d: Date): Date => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
};

/** Monday-first week start. */
export const startOfWeek = (d: Date): Date => {
  const next = startOfDay(d);
  const shift = (next.getDay() + 6) % 7;
  return addDays(next, -shift);
};

export const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);

export const sameDay = (a: Date, b: Date): boolean => isoDate(a) === isoDate(b);

export const minutesSinceMidnight = (d: Date): number => d.getHours() * 60 + d.getMinutes();

export const fmtTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const fmtDateLong = (d: Date): string =>
  `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;

export const MONTHS = [
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
] as const;

export const fmtRangeLabel = (from: Date, to: Date): string =>
  sameDay(from, to)
    ? fmtDateLong(from)
    : `${from.getDate()}. ${MONTHS[from.getMonth()]} – ${to.getDate()}. ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;

/** Human duration, e.g. "2 t 30 min". */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h} t ${m} min`;
  if (h) return `${h} t`;
  return `${m} min`;
}

/** Calm relative deadline, e.g. "om 3 t 12 min" / "udløbet". */
export function fmtDeadline(target: Date, now = new Date()): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "Fristen er udløbet";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `Svar inden ${mins} min`;
  const h = Math.floor(mins / 60);
  return `Svar inden ${h} t ${mins % 60} min`;
}
