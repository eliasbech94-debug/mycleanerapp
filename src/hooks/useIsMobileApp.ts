/**
 * useIsMobileApp — gates the mobile-app shell.
 *
 * Returns true only when BOTH:
 *  1. viewport width is strictly below 768px, and
 *  2. the current pathname matches the explicit route whitelist.
 *
 * Phase 2: shell/primitives exist but no route is rendered inside the shell
 * yet. This hook is the single source of truth for later phases and tests.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const MOBILE_APP_BREAKPOINT = 768;

/**
 * Market prefixes are mirrored from `COUNTRY_ROUTE_PREFIXES` in `src/App.tsx`.
 * Keep both in sync. The router only mounts these four country prefixes today;
 * `/de` and `/uk` are NOT existing routes and must not be added here without a
 * corresponding router change. Language selection is handled separately by
 * i18next and is not encoded in the URL path, so no language prefix is stripped.
 */
export const MARKET_PREFIXES = ["dk", "gb", "se", "es"] as const;
const COUNTRY_PREFIX = new RegExp(`^/(${MARKET_PREFIXES.join("|")})(?=/|$)`, "i");

// Explicit whitelist — mirrors the marketplace/customer surface where a
// mobile-app shell is desired. Static informational pages (/faq, /regler)
// are intentionally excluded: they have no authenticated app flow and read
// better in the standard document layout.
export const MOBILE_APP_ROUTE_WHITELIST: RegExp[] = [
  /^\/$/,
  /^\/find-cleaner(\/|$)/,
  /^\/marketplace(\/|$)/,
  /^\/book(\/|$)/,
  /^\/mine-bookinger(\/|$)/,
  /^\/customer(\/|$)/,
  /^\/profil(\/|$)/,
  /^\/inbox(\/|$)/,
  /^\/p\/[^/]+(\/|$)/,
  /^\/founding-cleaner(\/|$)/,
];

export function normalizePath(pathname: string): string {
  const stripped = pathname.replace(COUNTRY_PREFIX, "");
  return stripped === "" ? "/" : stripped;
}

export function matchesMobileAppRoute(pathname: string): boolean {
  const p = normalizePath(pathname);
  return MOBILE_APP_ROUTE_WHITELIST.some((re) => re.test(p));
}

export function useIsMobileApp(): boolean {
  const { pathname } = useLocation();
  const [belowBreakpoint, setBelowBreakpoint] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_APP_BREAKPOINT;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_APP_BREAKPOINT - 1}px)`);
    const onChange = () => setBelowBreakpoint(window.innerWidth < MOBILE_APP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return belowBreakpoint && matchesMobileAppRoute(pathname);
}
