import { useLocation } from "react-router-dom";
import EarlyAccessBanner from "@/components/launch/EarlyAccessBanner";
import { countryPrefixFromPathname } from "@/lib/countryPath";
import { useAuth } from "@/hooks/useAuth";

/**
 * The ONLY surfaces where the Early Access marketing banner may render:
 * the public homepage and the dedicated Early Access / signup landing pages.
 *
 * Everything else — dashboards, calendar, bookings, messages, profile,
 * payments, admin and support — must never show it.
 */
const PUBLIC_MARKETING_PATHS = ["/", "/early-access", "/bliv-cleaner"];

/** Strips the market prefix ("/dk/...") so the allowlist is market agnostic. */
function normalisePath(pathname: string): string {
  const prefix = countryPrefixFromPathname(pathname);
  if (!prefix) return pathname === "" ? "/" : pathname;
  const rest = pathname.slice(prefix.length + 1);
  return rest === "" ? "/" : rest;
}

export function isEarlyAccessBannerRoute(pathname: string): boolean {
  const path = normalisePath(pathname).replace(/\/+$/, "") || "/";
  return PUBLIC_MARKETING_PATHS.includes(path);
}

/**
 * Renders the hero Early Access banner only for unauthenticated visitors on a
 * public marketing route. Authenticated users never see it, anywhere.
 */
export function EarlyAccessBannerSlot() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();

  if (loading || user) return null;
  if (!isEarlyAccessBannerRoute(pathname)) return null;

  // On "/" below 768px the mobile app shell renders its own copy inside the
  // shell (under MobileAppBar), so the root-level banner is desktop-only there.
  const isHome = (normalisePath(pathname).replace(/\/+$/, "") || "/") === "/";

  if (isHome) {
    return (
      <div className="hidden md:block">
        <EarlyAccessBanner variant="hero" />
      </div>
    );
  }

  return <EarlyAccessBanner variant="hero" />;
}

export default EarlyAccessBannerSlot;
