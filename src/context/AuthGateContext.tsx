/**
 * AuthGateContext — UI-only orchestrator for the marketplace auth dialogs.
 *
 * Owns nothing about authentication itself; it simply mounts three shared
 * dialogs (login / role-selection / country-confirmation) and exposes
 * imperative helpers so any presentation-layer component can trigger them.
 *
 * All authentication still runs through `useAuth` + Supabase.
 * All country state still lives in `ActiveMarketContext`.
 */
import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { setPendingAction } from "@/lib/pendingAction";
import { AuthDialog } from "@/components/marketplace/AuthDialog";
import { RoleChoiceDialog } from "@/components/marketplace/RoleChoiceDialog";

type OpenLoginOpts = { reason?: string; redirectTo?: string };

interface AuthGateValue {
  openLogin: (opts?: OpenLoginOpts) => void;
  openRegister: () => void;
  /** For anonymous-gated actions: opens login and remembers where to resume. */
  requireAuth: (opts: OpenLoginOpts & { user: unknown | null; run: () => void }) => void;
}

const Ctx = createContext<AuthGateValue | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const location = useLocation();

  const openLogin = useCallback((opts?: OpenLoginOpts) => {
    const href = opts?.redirectTo ?? `${location.pathname}${location.search}`;
    setPendingAction({ href, reason: opts?.reason });
    setLoginOpen(true);
  }, [location.pathname, location.search]);

  const openRegister = useCallback(() => setRegisterOpen(true), []);

  const requireAuth = useCallback<AuthGateValue["requireAuth"]>(({ user, run, reason, redirectTo }) => {
    if (user) { run(); return; }
    openLogin({ reason, redirectTo });
  }, [openLogin]);

  const value = useMemo<AuthGateValue>(() => ({ openLogin, openRegister, requireAuth }), [openLogin, openRegister, requireAuth]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AuthDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSwitchToRegister={() => { setLoginOpen(false); setRegisterOpen(true); }}
      />
      <RoleChoiceDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </Ctx.Provider>
  );
}

export function useAuthGate(): AuthGateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuthGate must be used inside <AuthGateProvider>");
  return v;
}
