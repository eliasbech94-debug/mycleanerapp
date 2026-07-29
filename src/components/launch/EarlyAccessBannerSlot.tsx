import { useLocation } from "react-router-dom";
import EarlyAccessBanner from "@/components/launch/EarlyAccessBanner";

/** Routes where the compact Early Access reminder stays relevant. */
const COMPACT_PREFIXES = [
  "/customer",
  "/provider",
  "/admin",
  "/support",
  "/profil",
  "/bliv-cleaner",
  "/marketplace",
  "/find-cleaner",
];

/** Auth surfaces show only the small inline Early Access chip. */
const AUTH_ROUTES = ["/login", "/reset-password", "/customer/register", "/auth/callback"];

/**
 * Chooses the right Early Access presentation per surface:
 * large hero banner on the homepage, compact strip on dashboards and
 * other logged-in surfaces, nothing elsewhere.
 */
export function EarlyAccessBannerSlot() {
  const { pathname } = useLocation();

  if (AUTH_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;



  // On "/" below 768px the mobile app shell renders its own copy inside the
  // shell (under MobileAppBar), so the root-level banner is desktop-only.
  if (pathname === "/") {
    return (
      <div className="hidden md:block">
        <EarlyAccessBanner variant="hero" />
      </div>
    );
  }

  if (COMPACT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 pt-3 sm:px-6">
        <EarlyAccessBanner variant="compact" />
      </div>
    );
  }

  return null;
}

export default EarlyAccessBannerSlot;
