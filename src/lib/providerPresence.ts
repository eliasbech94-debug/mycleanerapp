/**
 * Provider activity presence — thresholds and public wording.
 *
 * Presence describes whether the provider's app has recently been open.
 * It NEVER overrides the authoritative live status (calendar / working hours /
 * booking lifecycle). It is purely supporting information.
 *
 * All thresholds live here — never re-declare them in components.
 */

export type PresenceState = "online" | "recent" | "idle" | "offline" | "unknown";

/** Fresher than this ⇒ "Online nu". */
export const PRESENCE_ONLINE_MINUTES = 3;
/** Fresher than this ⇒ "Aktiv for få minutter siden". */
export const PRESENCE_RECENT_MINUTES = 15;
/** Older than this ⇒ no public activity text at all. */
export const PRESENCE_VISIBLE_MINUTES = 60;

/** Client heartbeat cadence while the app is actively used (3 min). */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;
/** Client-side guard so no heartbeat is sent more than once per 2 minutes. */
export const PRESENCE_HEARTBEAT_MIN_GAP_MS = 2 * 60 * 1000;

export type PresenceInfo = {
  state: PresenceState;
  /** Whole minutes since the last app activity, or null when unknown/too old. */
  minutes: number | null;
  /** Public text, or null when nothing may be shown. */
  text: string | null;
  /** True only while the heartbeat is fresh. */
  online: boolean;
};

const WORDING = {
  da: {
    online: "Online nu",
    recent: "Aktiv for få minutter siden",
    minutes: (m: number) => `Aktiv for ${m} min. siden`,
  },
  en: {
    online: "Online now",
    recent: "Active a few minutes ago",
    minutes: (m: number) => `Active ${m} min ago`,
  },
} as const;

export type PresenceLocale = keyof typeof WORDING;

/** Derive presence state purely from the age of the heartbeat (in minutes). */
export function presenceStateFromMinutes(minutes: number | null | undefined): PresenceState {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) {
    return "unknown";
  }
  if (minutes < PRESENCE_ONLINE_MINUTES + 1) return "online";
  if (minutes <= PRESENCE_RECENT_MINUTES) return "recent";
  if (minutes <= PRESENCE_VISIBLE_MINUTES) return "idle";
  return "offline";
}

/**
 * Maps the minimal server presence fields into what the public UI may show.
 * Anything older than {@link PRESENCE_VISIBLE_MINUTES} is hidden entirely.
 */
export function resolvePresence(
  state: string | null | undefined,
  minutes: number | null | undefined,
  locale: PresenceLocale = "da",
): PresenceInfo {
  const words = WORDING[locale] ?? WORDING.da;
  const derived = presenceStateFromMinutes(minutes ?? null);
  // Trust the server state only when it agrees that presence is still visible.
  const resolved: PresenceState =
    derived === "unknown" && state === "offline" ? "offline" : derived;

  if (resolved === "online") return { state: resolved, minutes: minutes ?? 0, text: words.online, online: true };
  if (resolved === "recent") return { state: resolved, minutes: minutes ?? null, text: words.recent, online: false };
  if (resolved === "idle" && typeof minutes === "number") {
    return { state: resolved, minutes, text: words.minutes(minutes), online: false };
  }
  return { state: resolved === "idle" ? "offline" : resolved, minutes: null, text: null, online: false };
}
