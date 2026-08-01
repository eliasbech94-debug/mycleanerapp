/**
 * Country-prefix aware path helpers.
 *
 * The router mounts the full route tree twice: once at "/*" and once at
 * "/{country}/*" (see COUNTRY_ROUTE_PREFIXES in App.tsx). Absolute links and
 * <Navigate to="/..."> therefore silently drop the active market prefix, which
 * throws the user out of their localised URL space (and breaks refresh/deep
 * links that expect the prefix to survive navigation).
 *
 * These helpers keep the prefix intact without duplicating any route.
 */
import { useCallback } from "react";
import { useLocation } from "react-router-dom";

export const COUNTRY_ROUTE_PREFIXES = ["dk", "gb", "se", "es", "de"] as const;
export type CountryRoutePrefix = (typeof COUNTRY_ROUTE_PREFIXES)[number];

/** Returns the active market prefix ("dk") or null when the URL is unprefixed. */
export function countryPrefixFromPathname(pathname: string): CountryRoutePrefix | null {
  const first = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return (COUNTRY_ROUTE_PREFIXES as readonly string[]).includes(first ?? "")
    ? (first as CountryRoutePrefix)
    : null;
}

/**
 * Prefixes an absolute in-app path with the given market prefix.
 * Relative paths, external URLs and hashes are returned untouched.
 */
export function withCountryPrefix(prefix: CountryRoutePrefix | null, to: string): string {
  if (!prefix) return to;
  if (!to.startsWith("/")) return to;
  if (/^\/\//.test(to)) return to;
  if (countryPrefixFromPathname(to)) return to;
  return `/${prefix}${to === "/" ? "" : to}`;
}

/** Hook returning a stable `to => localisedTo` mapper for the current URL. */
export function useCountryPath(): (to: string) => string {
  const { pathname } = useLocation();
  const prefix = countryPrefixFromPathname(pathname);
  return useCallback((to: string) => withCountryPrefix(prefix, to), [prefix]);
}
