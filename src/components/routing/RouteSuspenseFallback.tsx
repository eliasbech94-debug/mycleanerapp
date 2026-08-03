/**
 * Suspense fallback for lazily-loaded route groups.
 *
 * Deliberately quiet: the global RouteLoadingBar already communicates
 * progress at the top of the viewport, so this only needs to hold vertical
 * space to prevent the footer jumping up while a chunk resolves. Announces
 * itself to assistive tech without stealing focus.
 */
export default function RouteSuspenseFallback() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[60vh] w-full items-center justify-center"
    >
      <span className="sr-only">Indlæser side…</span>
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
      />
    </div>
  );
}
