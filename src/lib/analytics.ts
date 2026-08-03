/**
 * Minimal analytics dispatcher.
 *
 * The platform has no dedicated analytics provider wired up yet, so this is a
 * thin, dependency-free shim: it forwards to whatever is present on `window`
 * (gtag / dataLayer / a custom `mcAnalytics` sink) and is otherwise a no-op.
 * Never throws — analytics must never break a user flow.
 */
export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    mcAnalytics?: { track: (event: string, payload?: AnalyticsPayload) => void };
  }
}

export function trackEvent(event: string, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.mcAnalytics?.track(event, payload);
    window.gtag?.("event", event, payload);
    if (!window.gtag && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...payload });
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", event, payload);
    }
  } catch {
    /* analytics must never break the app */
  }
}
