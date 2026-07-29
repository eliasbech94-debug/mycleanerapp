/**
 * Small helper module so tests can `vi.mock` the env accessor.
 * SWC inlines `import.meta.env.*` at transform time, so we cannot mutate
 * it at runtime; wrapping the read in a plain function gives us a hook.
 */
export function getAppEnv(): string | undefined {
  return import.meta.env.VITE_APP_ENV as string | undefined;
}

/**
 * Development-only preview routes (e.g. /dev/provider-profile-preview).
 *
 * Fail-closed: anything that is not an explicit dev/preview/staging context is
 * treated as production, so the route is never registered in a production build.
 */
export function isDevPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  const env = (getAppEnv() ?? "production").toLowerCase();
  return env === "development" || env === "preview" || env === "staging";
}
