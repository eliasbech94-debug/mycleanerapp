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

// Explicit whitelist — mirrors the marketplace/profile surface that the
// mobile bottom nav already covers. Country-prefixed variants
// (/dk, /gb, /se, /es) are normalized before matching.
export const MOBILE_APP_ROUTE_WHITELIST: RegExp[] = [
  /^\/$/,
  /^\/find-cleaner(\/|$)/,
  /^\/marketplace(\/|$)/,
  /^\/book(\/|$)/,
  /^\/mine-bookinger(\/|$)/,
  /^\/customer(\/|$)/,
  /^\/profil(\/|$)/,
  /^\/faq(\/|$)/,
  /^\/regler(\/|$)/,
  /^\/inbox(\/|$)/,
  /^\/p\/[^/]+(\/|$)/,
];

const COUNTRY_PREFIX = /^\/(dk|gb|se|es)(?=\/|$)/i;

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
