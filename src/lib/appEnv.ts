/**
 * Small helper module so tests can `vi.mock` the env accessor.
 * SWC inlines `import.meta.env.*` at transform time, so we cannot mutate
 * it at runtime; wrapping the read in a plain function gives us a hook.
 */
export function getAppEnv(): string | undefined {
  return import.meta.env.VITE_APP_ENV as string | undefined;
}
