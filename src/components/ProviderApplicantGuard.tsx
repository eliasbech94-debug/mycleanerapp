// Guard for onboarding routes: any authenticated user who owns a
// non-archived provider_profiles row (or is admin). Creates a draft row via
// `start_provider_application` on first visit so the wizard is resumable.
import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { useCountryPath } from "@/lib/countryPath";

type Props = { children: ReactNode; autoStart?: boolean };

function providerSignupPath(localize: (path: string) => string, redirectTo: string): string {
  const loginPath = localize("/login");
  const params = new URLSearchParams({
    mode: "signup",
    role: "provider",
    redirect: redirectTo,
  });
  return `${loginPath}?${params.toString()}`;
}

export function ProviderApplicantGuard({ children, autoStart = true }: Props) {
  const location = useLocation();
  const localize = useCountryPath();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [status, setStatus] = useState<
    "loading" | "ok" | "no_profile" | "archived" | "starting" | "start_failed"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (authLoading || rolesLoading) return;
      if (!user) return;
      setStatus("loading");
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("user_id, status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setStatus("no_profile"); return; }
      if (!data) {
        if (!autoStart) { setStatus("no_profile"); return; }
        setStatus("starting");
        const { error: fnErr } = await supabase.functions.invoke("provider-start-application");
        if (cancelled) return;
        setStatus(fnErr ? "start_failed" : "ok");
        return;
      }
      if (data.status === "archived") { setStatus("archived"); return; }
      setStatus("ok");
    }
    check();
    return () => { cancelled = true; };
  }, [user, authLoading, rolesLoading, autoStart]);

  // Signed-out visitors must be sent to signup immediately — showing an
  // endless spinner would leave them with no visible next step.
  if (!authLoading && !rolesLoading && !user) {
    const redirectTo = location.pathname + location.search;
    return <Navigate to={providerSignupPath(localize, redirectTo)} replace />;
  }
  if (authLoading || rolesLoading || status === "loading" || status === "starting") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {status === "starting" ? "Opretter din ansøgning…" : "Henter din ansøgning…"}
        </p>
      </div>
    );
  }

  if (status === "archived" && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-serif">Ansøgning arkiveret</h1>
          <p className="text-muted-foreground">
            Din ansøgning er arkiveret og kan ikke længere redigeres. Kontakt support hvis du mener det er en fejl.
          </p>
        </div>
      </div>
    );
  }
  if (status === "start_failed" || status === "no_profile") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-serif">Vi kunne ikke starte din ansøgning</h1>
          <p className="text-muted-foreground">Prøv igen om et øjeblik — intet er gået tabt.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-foreground px-5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Prøv igen
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
