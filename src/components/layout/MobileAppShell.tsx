/**
 * MobileAppShell — chrome for the mobile-app experience.
 *
 * Renders a top MobileAppBar, an independently scrolling main content area
 * (momentum scrolling + safe-area padding), and reserves space for the
 * fixed MobileBottomNav that already lives at the app root.
 *
 * Phase 5B additions (presentation only):
 *  - `data-mobile-scroll-root` on <main> so `usePullToRefresh` can find the
 *    real scroll container without new props / new dependency.
 *  - Lightweight CSS-only route-transition on the content wrapper. Only the
 *    page content is animated — the fixed MobileAppBar and MobileBottomNav
 *    are never animated / remounted. Reduced-motion disables the animation
 *    via the existing shell-scoped `prefers-reduced-motion` rule.
 *  - No remount of children on route change; we re-trigger a CSS animation
 *    by toggling a class, so authenticated data/state is preserved.
 *  - No new dependency.
 */
import * as React from "react";
import { useLocation } from "react-router-dom";
import { MobileAppBar, type MobileAppBarProps } from "./MobileAppBar";
import { cn } from "@/lib/utils";

export type MobileAppShellProps = {
  appBar?: MobileAppBarProps | false;
  /** Reserve space for the fixed MobileBottomNav. Defaults to true. */
  withBottomNav?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

export function MobileAppShell({
  appBar,
  withBottomNav = true,
  className,
  contentClassName,
  children,
}: MobileAppShellProps) {
  const location = useLocation();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  // Retrigger a CSS route-enter animation on pathname change without
  // remounting children. Reduced-motion is already neutralized inside the
  // shell by the global `prefers-reduced-motion` rule in index.css.
  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.classList.remove("mobile-route-enter");
    // Force reflow so removing/adding restarts the animation.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void el.offsetWidth;
    el.classList.add("mobile-route-enter");
  }, [location.pathname]);

  return (
    <div
      data-testid="mobile-app-shell"
      data-surface="marketplace"
      className={cn(
        "flex min-h-[100dvh] flex-col bg-[hsl(var(--mkt-bg))] text-[hsl(var(--mkt-ink))]",
        className,
      )}
    >
      {appBar === false ? null : appBar ? <MobileAppBar {...appBar} /> : null}
      <main
        role="main"
        data-mobile-scroll-root=""
        className={cn(
          "flex-1 overflow-y-auto momentum-scroll",
          contentClassName,
        )}
        style={{
          paddingBottom: withBottomNav
            ? "calc(68px + env(safe-area-inset-bottom, 0px))"
            : "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div ref={contentRef} data-testid="mobile-route-content" className="mobile-route-enter">
          {children}
        </div>
      </main>
    </div>
  );
}

export default MobileAppShell;
