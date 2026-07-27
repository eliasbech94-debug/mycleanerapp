/**
 * MobileHomeGate — chooses between MobileHome (below 768px) and Index
 * (>=768px) at `/` without changing the URL or route path.
 *
 * The desktop path stays wired to `Index.tsx` unchanged. Mobile path lazy-
 * loads `MobileHome.tsx` and renders it inside `MobileAppShell`.
 *
 * The initial `belowBreakpoint` is read synchronously from window.innerWidth
 * to prevent a first-render flicker between mobile/desktop layouts. Only
 * customers/providers/guests are routed to MobileHome; admin, employee,
 * super_admin and support keep the standard desktop Index at all viewports.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { MobileAppShell } from "@/components/layout/MobileAppShell";
import Index from "@/pages/Index";

const MobileHome = lazy(() => import("@/pages/mobile/MobileHome"));

const MOBILE_APP_BREAKPOINT = 768;

function useIsMobileViewport(): boolean {
  const [below, setBelow] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_APP_BREAKPOINT;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_APP_BREAKPOINT - 1}px)`);
    const onChange = () => setBelow(window.innerWidth < MOBILE_APP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

/**
 * Role-resolution rule (Phase 3):
 *   - Mobile home is intended for guests, customers and providers.
 *   - Admin, employee, super_admin and support accounts fall through to the
 *     existing desktop Index on every viewport. This preserves their
 *     existing `/` behavior and prevents accidentally showing a customer
 *     home to an operations account.
 *   - Multi-role users: if the account holds ONLY operations roles
 *     (admin/super_admin/employee/support) → desktop Index. Otherwise the
 *     existing useHomeAudience() priority applies (provider > customer).
 */
export function shouldUseMobileHome(roles: {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isEmployee: boolean;
  isSupport: boolean;
  isProvider: boolean;
  isCustomer: boolean;
}, hasUser: boolean): boolean {
  if (!hasUser) return true; // guest
  const operationsOnly =
    (roles.isAdmin || roles.isSuperAdmin || roles.isEmployee || roles.isSupport) &&
    !roles.isProvider &&
    !roles.isCustomer;
  return !operationsOnly;
}

export default function MobileHomeGate() {
  const below = useIsMobileViewport();
  const { user, loading: authLoading } = useAuth();
  const roles = useUserRoles();

  // Desktop path — untouched Index.
  if (!below) return <Index />;

  // Auth/roles still resolving — render shell with skeleton to hold layout.
  if (authLoading || roles.loading) {
    return (
      <MobileAppShell
        appBar={false}
        className="!min-h-0"
        contentClassName="!overflow-visible"
      >
        <div className="animate-pulse px-4 pt-4">
          <div className="h-3 w-24 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="mt-2 h-7 w-3/4 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="mt-4 h-[104px] rounded-3xl bg-[hsl(var(--mkt-brand-soft))]" />
        </div>
      </MobileAppShell>
    );
  }

  if (!shouldUseMobileHome(roles, Boolean(user))) {
    return <Index />;
  }

  return (
    <MobileAppShell
      appBar={false}
      className="!min-h-0"
      contentClassName="!overflow-visible"
    >
      <Suspense
        fallback={
          <div className="animate-pulse px-4 pt-4">
            <div className="h-3 w-24 rounded bg-[hsl(var(--mkt-brand-soft))]" />
            <div className="mt-2 h-7 w-3/4 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          </div>
        }
      >
        <MobileHome />
      </Suspense>
    </MobileAppShell>
  );
}
