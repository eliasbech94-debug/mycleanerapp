/**
 * pendingAction — remembers where an anonymous visitor was heading when the
 * app asked them to sign in, so `AuthGateContext` can resume the flow after
 * successful authentication without inventing a parallel routing system.
 *
 * The stored value is deliberately minimal: the target URL (path + search)
 * plus an optional label used for analytics. Booking / address / cleaner
 * state is already owned by the existing booking flow contract — we only
 * store the URL that the visitor would have followed.
 */
const KEY = "mc.auth.pendingAction";

export type PendingAction = {
  /** Absolute path incl. querystring. Must be same-origin. */
  href: string;
  /** Free-form label for logging: "book", "favorite", "message", "profile". */
  reason?: string;
  /** Timestamp used to expire stale entries after 30 minutes. */
  at: number;
};

const MAX_AGE_MS = 30 * 60 * 1000;

export function setPendingAction(next: Omit<PendingAction, "at">): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    // Only same-origin, non-external URLs are accepted — never store an
    // absolute URL that would let a redirect escape the app.
    if (!next.href.startsWith("/") || next.href.startsWith("//")) return;
    sessionStorage.setItem(KEY, JSON.stringify({ ...next, at: Date.now() }));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function readPendingAction(): PendingAction | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAction;
    if (!parsed?.href || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingAction(): void {
  try { sessionStorage?.removeItem(KEY); } catch { /* ignore */ }
}
