/**
 * Small helper module so tests can `vi.mock` the env accessor.
 * SWC inlines `import.meta.env.*` at transform time, so we cannot mutate
 * it at runtime; wrapping the read in a plain function gives us a hook.
 */
export function getAppEnv(): string | undefined {
  return import.meta.env.VITE_APP_ENV as string | undefined;
}

/**
 * Hostnames that always serve the real product. The dev preview route must
 * never be reachable there, even if a build was mis-configured with the flag.
 */
export const PRODUCTION_HOSTNAMES = [
  "mycleaner.dk",
  "www.mycleaner.dk",
  "mycleanerapp.lovable.app",
] as const;

export function isProductionHostname(hostname?: string): boolean {
  const host = (
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "")
  )
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) return false;
  return PRODUCTION_HOSTNAMES.some((h) => host === h);
}

/**
 * Development-only preview routes (e.g. /dev/provider-profile-preview).
 *
 * Enabled when the Vite dev server runs, or when the build explicitly opts in
 * via VITE_ENABLE_PROVIDER_PROFILE_PREVIEW="true" (set only in dev / Lovable
 * preview env files, never in production).
 *
 * A runtime hostname guard always wins: on an official production hostname the
 * route is never registered, so it falls through to the 404 page.
 *
 * MODE is deliberately NOT used — Lovable Preview serves a production build.
 */
export function isDevPreviewEnabled(): boolean {
  if (isProductionHostname()) return false;
  if (import.meta.env.DEV) return true;
  return (
    (import.meta.env.VITE_ENABLE_PROVIDER_PROFILE_PREVIEW as string | undefined) === "true"
  );
}
