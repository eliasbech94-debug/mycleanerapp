import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles, AppRole } from "@/hooks/useUserRoles";
import { Loader2, ShieldAlert } from "lucide-react";

type Props = {
  allow: AppRole[];
  children: ReactNode;
};

export function RoleGuard({ allow, children }: Props) {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { roles, isSuperAdmin, loading } = useUserRoles();

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Super-admin has automatic access to everything
  const ok = isSuperAdmin || roles.some((r) => allow.includes(r));
  if (!ok) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-serif">Ingen adgang</h1>
          <p className="text-muted-foreground">
            Du har ikke rettigheder til at se denne side. Kontakt en administrator
            hvis du mener det er en fejl.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
