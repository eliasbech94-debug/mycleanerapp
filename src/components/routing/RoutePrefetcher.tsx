import { useEffect } from "react";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  prefetchForRole,
  prefetchGroupForPath,
  type PrefetchRole,
} from "@/routes/groups";

/**
 * Intelligent route prefetching.
 *
 * Renders nothing and changes no behaviour. It only warms chunks that the
 * user is very likely to need next, so the first in-app navigation after
 * login does not pay a cold network round trip.
 *
 * Two signals:
 *
 * 1. **Authentication** — once roles resolve, warm that role's home group
 *    (customer -> customer dashboard, provider -> provider dashboard,
 *    admin/support -> their consoles).
 * 2. **Intent** — a delegated pointer/focus listener warms the group behind
 *    any in-app link the user hovers or tab-focuses. This is what makes
 *    "opening Find Cleaner" preload Mapbox without having to touch every
 *    link component in the app.
 *
 * Everything is fire-and-forget: a failed prefetch is swallowed and the
 * normal lazy import simply runs on navigation.
 */
export default function RoutePrefetcher() {
  const { roles, loading } = useUserRoles();

  // Signal 1 — role-based prefetch, once auth has settled.
  useEffect(() => {
    if (loading || roles.length === 0) return;

    // Warm every role the user holds; most users hold exactly one.
    const idle = scheduleIdle(() => {
      for (const role of roles) {
        prefetchForRole(role as PrefetchRole);
      }
    });

    return idle;
  }, [roles, loading]);

  // Signal 2 — intent-based prefetch on hover/focus of in-app links.
  useEffect(() => {
    function handleIntent(event: Event) {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      // Only same-origin, in-app paths. Ignore external links and hashes.
      if (!href || !href.startsWith("/")) return;

      prefetchGroupForPath(href);
    }

    document.addEventListener("pointerover", handleIntent, { passive: true });
    document.addEventListener("focusin", handleIntent, { passive: true });

    return () => {
      document.removeEventListener("pointerover", handleIntent);
      document.removeEventListener("focusin", handleIntent);
    };
  }, []);

  return null;
}

/**
 * Run work when the main thread is free, so prefetching never competes with
 * rendering the route the user is actually looking at. Falls back to a short
 * timeout where requestIdleCallback is unavailable (Safari).
 */
function scheduleIdle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof w.requestIdleCallback === "function") {
    const handle = w.requestIdleCallback(run);
    return () => w.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(run, 300);
  return () => window.clearTimeout(timer);
}
