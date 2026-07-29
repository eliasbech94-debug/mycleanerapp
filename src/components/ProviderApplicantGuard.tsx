// Guard for onboarding routes: any authenticated user who owns a
// non-archived provider_profiles row (or is admin). Creates a draft row via
// `start_provider_application` on first visit so the wizard is resumable.
import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";

type Props = { children: ReactNode; autoStart?: boolean };

export function ProviderApplicantGuard({ children, autoStart = true }: Props) {
  const location = useLocation();
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

  if (authLoading || rolesLoading || status === "loading" || status === "starting") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;

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
          <h1 className="text-2xl font-serif">Kunne ikke starte ansøgning</h1>
          <p className="text-muted-foreground">Prøv igen om et øjeblik.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
