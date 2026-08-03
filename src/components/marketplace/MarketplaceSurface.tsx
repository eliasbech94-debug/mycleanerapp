import { ReactNode } from "react";

/**
 * MarketplaceSurface — wraps public customer-facing pages in a scoped
 * light theme (see `[data-surface="marketplace"]` in index.css). Nothing
 * outside this wrapper is affected, so provider/admin/internal dashboards
 * remain on their existing tokens.
 */
export function MarketplaceSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-surface="marketplace"
      className={`min-h-[calc(100dvh-4rem)] bg-[hsl(var(--mkt-bg))] text-[hsl(var(--mkt-ink))] ${className}`}
    >
      {children}
    </div>
  );
}
