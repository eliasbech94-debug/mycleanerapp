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

/**
 * Chooses the right Early Access presentation per surface:
 * large hero banner on the homepage, compact strip on dashboards and
 * other logged-in surfaces, nothing elsewhere.
 */
export function EarlyAccessBannerSlot() {
  const { pathname } = useLocation();

  if (pathname === "/") return <EarlyAccessBanner variant="hero" />;

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
