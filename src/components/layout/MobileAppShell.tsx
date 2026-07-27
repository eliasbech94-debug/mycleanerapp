/**
 * MobileAppShell — chrome for the mobile-app experience.
 *
 * Renders a top MobileAppBar, an independently scrolling main content area
 * (momentum scrolling + safe-area padding), and reserves space for the
 * fixed MobileBottomNav that already lives at the app root.
 *
 * Phase 2 note: shell is available for opt-in only. It is NOT rendered
 * around any existing page yet. Desktop/tablet (>=768px) layout unchanged.
 */
import * as React from "react";
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
  return (
    <div
      data-testid="mobile-app-shell"
      className={cn(
        "flex min-h-[100dvh] flex-col bg-[hsl(var(--mkt-bg))] text-[hsl(var(--mkt-ink))]",
        className,
      )}
    >
      {appBar === false ? null : appBar ? <MobileAppBar {...appBar} /> : null}
      <main
        role="main"
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
        {children}
      </main>
    </div>
  );
}

export default MobileAppShell;
