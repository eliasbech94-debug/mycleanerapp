import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EARLY_ACCESS_COPY, isBookingLocked } from "@/config/launch";

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
      style={{ background: "#f5f0e0", color: "#0a3d3a" }}
    >
      <div
        className="w-full max-w-lg rounded-[1.75rem] border-2 p-6 text-center sm:p-10"
        style={{ background: "#fbf6e7", borderColor: "#0a3d3a" }}
      >
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-full border-2"
          style={{ background: "#ff6b35", borderColor: "#0a3d3a", color: "#fbf6e7" }}
        >
          <CalendarClock className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
          {EARLY_ACCESS_COPY.lockedTitle}
        </h1>
        <p className="mt-4 text-sm leading-relaxed opacity-80 sm:text-base">
          {EARLY_ACCESS_COPY.lockedBody}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link to="/find-cleaner">Se cleaners</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Til forsiden</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

export default EarlyAccessRouteGuard;
