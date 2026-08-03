import { Navigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route guard: renders `children` only when the given URL param is a UUID.
 * Anything else (e.g. a slug) falls through to /not-found so it cannot
 * silently resolve against an id-based page and leak the wrong record.
 */
export function UuidGuard({ param, children }: { param: string; children: ReactNode }) {
  const params = useParams();
  const v = params[param];
  if (!v || !UUID_RE.test(v)) return <Navigate to="/not-found" replace />;
  return <>{children}</>;
}

/**
 * Legacy `/c/:slug` → canonical `/p/:slug` client-side redirect.
 *
 * NOTE: This is a client-side navigation, not an HTTP 301. Search engines and
 * shared links will still hit `/c/:slug` first. A true 301 requires hosting /
 * edge routing configuration that is outside this SPA's control.
 */
export function LegacySlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/not-found" replace />;
  return <Navigate to={`/p/${slug}`} replace />;
}
