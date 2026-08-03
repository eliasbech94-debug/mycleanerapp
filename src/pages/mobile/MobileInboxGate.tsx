/**
 * MobileInboxGate — mounts MobileMessages for < 768px on /inbox and
 * /inbox/:id. Above 768px, redirects to the existing /profil?tab=inbox
 * notifications panel so no new desktop surface is introduced.
 *
 * The /inbox route was previously advertised by MobileBottomNav but had
 * no matching route in App.tsx; this gate fills that gap using the
 * existing customer/provider conversation infrastructure.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import PrefixedNavigate from "@/components/routing/PrefixedNavigate";

const MobileMessages = lazy(() => import("./MobileMessages"));

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

export default function MobileInboxGate() {
  const mobile = useBelow768();
  if (!mobile) return <PrefixedNavigate to="/profil?tab=inbox" />;
  return (
    <Suspense fallback={null}>
      <MobileMessages />
    </Suspense>
  );
}
