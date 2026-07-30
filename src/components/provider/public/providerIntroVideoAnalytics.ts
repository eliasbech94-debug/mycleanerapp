/**
 * Analytics adapter — INTERFACE/STUB ONLY (Trust Engine Phase 1A).
 *
 * Deliberately performs no network calls and no third-party integration.
 * Events are buffered in memory so tests can assert on them; a later phase
 * swaps `sink` for a real transport.
 */

export const PROVIDER_INTRO_VIDEO_EVENTS = {
  opened: "provider_intro_video_opened",
  started: "provider_intro_video_started",
  completed: "provider_intro_video_completed",
  closed: "provider_intro_video_closed",
  failed: "provider_intro_video_failed",
} as const;

export type ProviderIntroVideoEvent =
  (typeof PROVIDER_INTRO_VIDEO_EVENTS)[keyof typeof PROVIDER_INTRO_VIDEO_EVENTS];

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

type Recorded = { event: ProviderIntroVideoEvent; payload?: AnalyticsPayload };

const buffer: Recorded[] = [];

/** No-op sink. Phase 1A never transmits anything. */
export function trackIntroVideoEvent(event: ProviderIntroVideoEvent, payload?: AnalyticsPayload) {
  buffer.push({ event, payload });
  if (buffer.length > 50) buffer.shift();
}

export function getRecordedIntroVideoEvents(): Recorded[] {
  return [...buffer];
}

export function resetIntroVideoEvents() {
  buffer.length = 0;
}
