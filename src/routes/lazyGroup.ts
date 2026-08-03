import { lazy, type ComponentType } from "react";

/**
 * Route code-splitting helpers.
 *
 * Every route group lives in a barrel module under `src/routes/groups/`.
 * Because all pages in a group are pulled through the *same* dynamic
 * `import()` specifier, Rollup emits exactly one chunk per group instead of
 * one chunk per route. That keeps the network profile sane (a handful of
 * meaningful chunks) while guaranteeing a first-time visitor never downloads
 * admin, finance or support code.
 *
 * This module is packaging only — it introduces no behavioural change to any
 * route. Guards, redirects and market prefixes stay exactly where they were,
 * outside the lazy boundary, so redirect decisions still happen before a
 * chunk is ever requested.
 */

type Loader<T> = () => Promise<T>;

/**
 * Lazily resolve a single named export out of a group barrel.
 *
 * `lazy()` memoises its factory, and the browser/bundler dedupes the
 * underlying module request, so calling this many times against one loader
 * costs a single network fetch for the whole group.
 */
export function lazyFrom<T extends Record<string, unknown>, K extends keyof T>(
  loader: Loader<T>,
  key: K,
) {
  return lazy(async () => {
    const mod = await loader();
    const Component = mod[key];

    if (!Component) {
      // Surfaces a barrel/route typo loudly in dev instead of rendering blank.
      throw new Error(
        `[routes] "${String(key)}" is missing from its route group barrel.`,
      );
    }

    return { default: Component as ComponentType<unknown> };
  });
}

/**
 * Fire a group's dynamic import without rendering it, so the chunk is warm in
 * the HTTP cache by the time the user navigates.
 *
 * Deliberately fire-and-forget: a failed prefetch must never surface an error
 * or an unhandled rejection. If it fails, the normal lazy import retries on
 * navigation and the user sees the standard loading state.
 */
export function prefetchGroup(loader: Loader<unknown>): void {
  try {
    void Promise.resolve(loader()).catch(() => {
      /* prefetch is best-effort */
    });
  } catch {
    /* prefetch is best-effort */
  }
}
