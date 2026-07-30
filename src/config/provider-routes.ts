/**
 * Shared provider route constants.
 *
 * `App.tsx` registers its provider routes from this object and the provider
 * feature roadmap links to it, so a roadmap card can never point at a route
 * that does not exist in the router.
 */
export const PROVIDER_APP_ROUTES = {
  dashboard: "/provider-dashboard",
  dashboardAlias: "/provider",
  identityVerification: "/verify-identity",
  providerProfile: "/provider/profile",
} as const;

export type ProviderAppRoute =
  (typeof PROVIDER_APP_ROUTES)[keyof typeof PROVIDER_APP_ROUTES];

export const PROVIDER_APP_ROUTE_PATHS: readonly ProviderAppRoute[] =
  Object.values(PROVIDER_APP_ROUTES);
