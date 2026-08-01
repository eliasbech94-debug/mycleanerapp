import { useTranslation } from "react-i18next";
import { ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import PrefixedNavigate from "@/components/routing/PrefixedNavigate";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles, AppRole } from "@/hooks/useUserRoles";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  allow: AppRole[];
  children: ReactNode;
};

type LogResult = "granted" | "denied" | "unauthenticated";

async function logAccessAttempt(args: {
  route: string;
  allow: AppRole[];
  userId: string | null;
  email: string | null;
  userRoles: AppRole[];
  result: LogResult;
  reason: string;
}) {
  try {
    await supabase.from("access_attempts").insert({
      user_id: args.userId,
      email: args.email,
      route: args.route,
      allowed_roles: args.allow as unknown as string[],
      user_roles: args.userRoles as unknown as string[],
      result: args.result,
      reason: args.reason,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    });
  } catch {
    // Logging fejl må aldrig blokere UI
  }
}

export function RoleGuard({ allow, children }: Props) {
  const { t } = useTranslation("common");
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { roles, isSuperAdmin, loading } = useUserRoles();

  // Loggér adgangsforsøg én gang pr. route + bruger
  const loggedKey = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading || loading) return;

    let result: LogResult;
    let reason: string;

    if (!user) {
      result = "unauthenticated";
      reason = "Ikke logget ind";
    } else if (isSuperAdmin) {
      result = "granted";
      reason = "super_admin bypass";
    } else if (roles.some((r) => allow.includes(r))) {
      result = "granted";
      reason = `Rolle matcher: ${roles.filter((r) => allow.includes(r)).join(", ")}`;
    } else {
      result = "denied";
      reason = roles.length
        ? `Brugerens roller (${roles.join(", ")}) matcher ikke ${allow.join(", ")}`
        : `Ingen tildelte roller; kræver ${allow.join(", ")}`;
    }

    const key = `${location.pathname}|${user?.id ?? "anon"}|${result}`;
    if (loggedKey.current === key) return;
    loggedKey.current = key;

    logAccessAttempt({
      route: location.pathname,
      allow,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      userRoles: roles,
      result,
      reason,
    });
  }, [authLoading, loading, user, roles, isSuperAdmin, allow, location.pathname]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    // Preserve the intended destination so login returns the provider/customer
    // to the guarded page instead of dumping them on a generic dashboard.
    const target = encodeURIComponent(location.pathname + location.search);
    return <PrefixedNavigate to={`/login?redirect=${target}`} />;
  }

  // Super-admin har automatisk adgang til alt
  const ok = isSuperAdmin || roles.some((r) => allow.includes(r));
  if (!ok) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-serif">{t("ui.noAccess")}</h1>
          <p className="text-muted-foreground">
            Du har ikke rettigheder til at se denne side. Forsøget er logget.
            Kontakt en administrator hvis du mener det er en fejl.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
