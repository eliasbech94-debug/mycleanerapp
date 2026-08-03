import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EARLY_ACCESS_COPY, isBookingLocked } from "@/config/launch";
import { C } from "@/lib/bookingTheme";

/**
 * Central frontend guard for booking / checkout / payment routes.
 *
 * When Early Access is active, direct URL navigation can never mount the
 * financial flow — the route renders a safe notice instead, so no
 * PaymentIntent, capture or payout call can be initiated.
 *
 * Extra UI safety layer only — backend validation stays authoritative.
 */
export function EarlyAccessRouteGuard({ children }: { children: ReactNode }) {
  if (!isBookingLocked()) return <>{children}</>;

  return (
    <main
      data-testid="early-access-blocked"
      className="grid min-h-[70vh] place-items-center px-4 py-16 font-editorial"
      style={{ background: C.cream, color: C.ink }}
    >
      <div
        className="w-full max-w-lg rounded-3xl border p-6 text-center shadow-[0_1px_2px_rgba(13,27,62,0.04),0_20px_48px_-32px_rgba(13,27,62,0.45)] sm:p-10"
        style={{ background: C.paper, borderColor: C.line }}
      >
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: C.orange, color: "#ffffff" }}
        >
          <CalendarClock className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
          {EARLY_ACCESS_COPY.lockedTitle}
        </h1>
        <p className="mt-4 text-sm leading-relaxed opacity-70 sm:text-base">
          {EARLY_ACCESS_COPY.lockedBody}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="min-h-[44px]">
            <Link to="/find-cleaner">Se cleaners</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link to="/">Til forsiden</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

export default EarlyAccessRouteGuard;

