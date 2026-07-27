/**
 * MobileMarketplaceGate — renders MobileSearch inside MobileAppShell on
 * viewports below 768px, and preserves the existing Marketplace page verbatim
 * at 768px and above.
 *
 * Gated route: `/marketplace` (and each `/<country>/marketplace` alias).
 * Guest access preserved — Marketplace has no RoleGuard today.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Marketplace from "@/pages/Marketplace";
import { MobileAppShell } from "@/components/layout/MobileAppShell";

const MobileSearch = lazy(() => import("@/pages/mobile/MobileSearch"));

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

export default function MobileMarketplaceGate() {
  const { t } = useTranslation("marketplace");
  const below = useBelow();
  if (!below) return <Marketplace />;
  return (
    <MobileAppShell
      appBar={{ title: t("mobileSearch.appBarTitle", "Find en Cleaner") }}
    >
      <Suspense fallback={<div className="px-4 pt-6" aria-hidden />}>
        <MobileSearch />
      </Suspense>
    </MobileAppShell>
  );
}
