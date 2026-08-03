import { prefetchGroup } from "@/routes/lazyGroup";

/**
 * Central registry of route-group loaders.
 *
 * Each entry is a bare dynamic `import()` of a barrel module, which is what
 * makes Rollup emit one chunk per group. Import these loaders — never the
 * barrels directly — from route definitions and prefetch call sites.
 */
export const loadAuth = () => import("./auth");
export const loadPublic = () => import("./public");
export const loadBooking = () => import("./booking");
export const loadCustomer = () => import("./customer");
export const loadProvider = () => import("./provider");
export const loadSupport = () => import("./support");
export const loadAdmin = () => import("./admin");
export const loadFinance = () => import("./finance");
export const loadKnowledge = () => import("./knowledge");
export const loadMaps = () => import("./maps");

/** Roles as exposed by the auth/role layer. */
export type PrefetchRole =
  | "customer"
  | "provider"
  | "admin"
  | "super_admin"
  | "support"
  | "employee";

/**
 * Warm the chunks a freshly-authenticated user is overwhelmingly likely to
 * need next, so their first in-app navigation feels instant.
 *
 * Intentionally conservative: one or two groups per role. Prefetching more
 * would just recreate the monolith on a delay and compete for bandwidth with
 * the route the user is actually looking at.
 */
export function prefetchForRole(role: PrefetchRole | null | undefined): void {
  switch (role) {
    case "customer":
      prefetchGroup(loadCustomer);
      break;
    case "provider":
      prefetchGroup(loadProvider);
      break;
    case "support":
      prefetchGroup(loadSupport);
      break;
    case "admin":
    case "super_admin":
      prefetchGroup(loadAdmin);
      break;
    case "employee":
      prefetchGroup(loadAdmin);
      break;
    default:
      break;
  }
}

/**
 * Intent-based prefetch: the user has signalled they are heading somewhere
 * heavy (hovering/focusing a "Find Cleaner" link, opening the search sheet)
 * before committing to the navigation.
 */
export function prefetchMaps(): void {
  prefetchGroup(loadMaps);
}

export function prefetchBooking(): void {
  prefetchGroup(loadBooking);
}

/** Market prefixes that may precede any in-app path (see COUNTRY_ROUTE_PREFIXES). */
const MARKET_PREFIXES = new Set(["dk", "gb", "se", "es", "de"]);

/**
 * Map an in-app path to the route group that serves it.
 *
 * Strips an optional market prefix first, so `/dk/find-cleaner` and
 * `/find-cleaner` resolve to the same group. Returns `null` for paths served
 * by the eager entry chunk (landing, 404) — nothing to prefetch.
 */
export function groupLoaderForPath(path: string): (() => Promise<unknown>) | null {
  const [rawPath] = path.split(/[?#]/);
  const segments = rawPath.split("/").filter(Boolean);

  if (segments.length > 0 && MARKET_PREFIXES.has(segments[0].toLowerCase())) {
    segments.shift();
  }

  const first = segments[0]?.toLowerCase();
  const second = segments[1]?.toLowerCase();

  if (!first) return null; // landing page — already in the entry chunk

  // Admin sub-areas that live in their own chunks take precedence.
  if (first === "admin") {
    if (second === "knowledge") return loadKnowledge;
    if (
      second === "finance" ||
      second === "payments" ||
      second === "accounting-rules" ||
      second === "accounting-reports"
    ) {
      return loadFinance;
    }
    return loadAdmin;
  }

  switch (first) {
    case "find-cleaner":
      return loadMaps;

    case "login":
    case "auth":
    case "reset-password":
      return loadAuth;

    case "book":
    case "booking":
    case "task":
      return loadBooking;

    case "customer":
    case "profil":
    case "inbox":
    case "mine-bookinger":
      return loadCustomer;

    case "provider":
    case "provider-dashboard":
    case "bliv-cleaner":
    case "verify-identity":
      // /provider/finance is the provider's statements page.
      return second === "finance" ? loadFinance : loadProvider;

    case "support":
      return loadSupport;

    case "employee":
      return loadAdmin;

    case "faq":
    case "regler":
    case "contact":
    case "kontakt":
    case "help":
    case "legal":
    case "privatliv":
    case "marketplace":
    case "founding-cleaner":
    case "campaigns":
    case "p":
    case "c":
      return loadPublic;

    default:
      return null;
  }
}

/**
 * Prefetch the group behind an in-app path, if any. Safe to call on every
 * hover: `prefetchGroup` is fire-and-forget and the module request is deduped
 * by the bundler and the HTTP cache.
 */
export function prefetchGroupForPath(path: string): void {
  const loader = groupLoaderForPath(path);
  if (loader) prefetchGroup(loader);
}


export function prefetchAuth(): void {
  prefetchGroup(loadAuth);
}
