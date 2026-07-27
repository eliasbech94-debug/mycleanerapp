/**
 * MobileProfileGate — renders MobileProfile as the profile landing
 * screen at < 768px when NO ?tab= query param is set. Sub-views
 * (?tab=info, ?tab=addresses, etc.) continue to render the existing
 * Profile page with its full forms, validation and mutation logic.
 *
 * At >= 768px the existing Profile is rendered unchanged.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Profile from "@/pages/Profile";

const MobileProfile = lazy(() => import("./MobileProfile"));

function useBelow768(): boolean {
  const [below, setBelow] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < 768,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setBelow(window.innerWidth < 768);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

export function shouldShowMobileProfileLanding(
  belowMd: boolean,
  hasTabParam: boolean,
): boolean {
  return belowMd && !hasTabParam;
}

export default function MobileProfileGate() {
  const [params] = useSearchParams();
  const belowMd = useBelow768();
  const hasTab = params.has("tab");
  if (shouldShowMobileProfileLanding(belowMd, hasTab)) {
    return (
      <Suspense fallback={null}>
        <MobileProfile />
      </Suspense>
    );
  }
  return <Profile />;
}
