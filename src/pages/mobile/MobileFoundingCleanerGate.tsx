/**
 * MobileFoundingCleanerGate — wraps the existing FoundingCleaner page in
 * MobileAppShell below 768px, and preserves the untouched public desktop
 * page at 768px and above.
 *
 * Below 768px:
 *   - Global Header is suppressed via `MOBILE_SHELL_HIDE_ROUTES` in Header.tsx.
 *   - Global website Footer is suppressed via `matchesMobileAppRoute()`.
 *   - MobileBottomNav is rendered by the app root (route is in the whitelist).
 *   - A single MobileAppBar is rendered with title + back button.
 *
 * From 768px and up:
 *   - Renders the untouched <FoundingCleaner /> so desktop chrome/layout is
 *     visually unchanged.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import FoundingCleaner from "@/pages/FoundingCleaner";
import { MobileAppShell } from "@/components/layout/MobileAppShell";

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

export default function MobileFoundingCleanerGate() {
  const below = useBelow();
  const navigate = useNavigate();
  const { t } = useTranslation("marketplace");

  if (!below) return <FoundingCleaner />;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <MobileAppShell
      appBar={{
        title: t("foundingCleaner.appBarTitle", "Founding Cleaner"),
        onBack: handleBack,
        backLabel: t("common.back", "Tilbage"),
      }}
    >
      <FoundingCleaner />
    </MobileAppShell>
  );
}
