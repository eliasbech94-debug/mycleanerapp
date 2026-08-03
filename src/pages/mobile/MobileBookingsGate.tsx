/**
 * MobileBookingsGate — renders MobileBookings inside MobileAppShell on
 * viewports below 768px, and preserves the existing MyBookings page verbatim
 * at 768px and above.
 *
 * Gated routes: `/mine-bookinger` and `/customer/bookings` (both currently
 * render MyBookings.tsx per src/App.tsx). Auth guarding remains identical:
 * `/customer/bookings` keeps its RoleGuard wrapper; `/mine-bookinger` keeps
 * its in-component auth-redirect behaviour via MyBookings itself (mobile
 * screen shows a signed-out empty state instead of redirecting when unauthed).
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import MyBookings from "@/pages/MyBookings";
import { MobileAppShell } from "@/components/layout/MobileAppShell";

const MobileBookings = lazy(() => import("@/pages/mobile/MobileBookings"));

const BREAKPOINT = 768;

function useBelow(): boolean {
  const [below, setBelow] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < BREAKPOINT,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`);
    const onChange = () => setBelow(window.innerWidth < BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

export default function MobileBookingsGate() {
  const { t } = useTranslation("marketplace");
  const below = useBelow();
  if (!below) return <MyBookings />;
  return (
    <MobileAppShell
      appBar={{ title: t("mobileBookings.appBarTitle", "Mine bookinger") }}
    >
      <Suspense fallback={<div className="px-4 pt-6" aria-hidden />}>
        <MobileBookings />
      </Suspense>
    </MobileAppShell>
  );
}
