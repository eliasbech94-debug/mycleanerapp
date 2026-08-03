/**
 * MobileAppBar — top app bar for the mobile app shell.
 *
 * Purely presentational. Accepts a contextual title, optional back button,
 * avatar and notification action. No routing/auth/role logic lives here;
 * consumers pass slot content in.
 *
 * Phase 2: not wired into any existing page. Available for future mobile
 * screens that opt into <MobileAppShell>.
 */
import * as React from "react";
import { ArrowLeft, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileAppBarProps = {
  title?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  avatar?: React.ReactNode;
  notificationCount?: number;
  onNotificationsClick?: () => void;
  right?: React.ReactNode;
  className?: string;
};

export function MobileAppBar({
  title,
  onBack,
  backLabel = "Tilbage",
  avatar,
  notificationCount,
  onNotificationsClick,
  right,
  className,
}: MobileAppBarProps) {
  return (
    <header
      role="banner"
      data-testid="mobile-app-bar"
      className={cn(
        "sticky top-0 z-40 flex items-center gap-2 border-b border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/95 px-3 backdrop-blur",
        "pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2",
        className,
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="tap-target inline-flex items-center justify-center rounded-full text-[hsl(var(--mkt-ink))] active:bg-[hsl(var(--mkt-ink))]/8"
          style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      ) : avatar ? (
        <div className="tap-target inline-flex items-center justify-center">{avatar}</div>
      ) : (
        <span className="tap-target" aria-hidden />
      )}

      {/* App-bar label is UI chrome, not the page heading. Keeping it a
          non-heading element guarantees a single <h1> per page. */}
      <div className="type-mobile-title flex-1 truncate text-center text-[hsl(var(--mkt-ink))]">
        {title}
      </div>

      {right ?? (
        onNotificationsClick ? (
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label={
              notificationCount
                ? `Notifikationer (${notificationCount} ulæste)`
                : "Notifikationer"
            }
            className="tap-target relative inline-flex items-center justify-center rounded-full text-[hsl(var(--mkt-ink))] active:bg-[hsl(var(--mkt-ink))]/8"
            style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {notificationCount && notificationCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-2 top-2 min-w-[16px] rounded-full bg-[hsl(var(--mkt-brand))] px-1 text-[10px] font-semibold leading-4 text-white"
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            ) : null}
          </button>
        ) : (
          <span className="tap-target" aria-hidden />
        )
      )}
    </header>
  );
}

export default MobileAppBar;
