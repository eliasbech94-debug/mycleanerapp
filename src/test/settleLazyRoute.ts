import { screen, waitFor } from "@testing-library/react";

/**
 * Wait for a lazily-loaded route group to finish resolving.
 *
 * Route pages are code-split by audience (see src/routes/groups), so the
 * router renders `RouteSuspenseFallback` for a tick before the real page
 * appears. Route tests call this immediately after render so their existing
 * assertions run against the settled route.
 *
 * This changes nothing about what the tests assert — it only waits for the
 * Suspense boundary to clear. If no fallback was ever shown (eager routes
 * like "/" and 404), it resolves immediately.
 */
export async function settleLazyRoute(): Promise<void> {
  await waitFor(
    () => {
      const fallback = screen.queryByRole("status", { busy: true });
      if (fallback) {
        throw new Error("route chunk still loading");
      }
    },
    // The first route in a file pays for the real dynamic import of the group
    // barrel, which can take well over waitFor's 1s default under Vitest's
    // transform pipeline. Later routes hit the module cache and resolve fast.
    { timeout: 15_000 },
  );
}
