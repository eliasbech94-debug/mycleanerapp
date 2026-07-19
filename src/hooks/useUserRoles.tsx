import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole =
  | "super_admin"
  | "admin"
  | "employee"
  | "support"
  | "provider"
  | "customer";

export function useUserRoles() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (error) {
        setRoles([]);
      } else {
        setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
      }
      setLoading(false);
    }
    if (!authLoading) load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = isSuperAdmin || roles.includes("admin");
  // Support agents include admins (per is_support_agent). Employee does NOT
  // automatically get support access — it's an operations role.
  const isSupport = isAdmin || roles.includes("support");
  const isEmployee = isSuperAdmin || roles.includes("employee");
  const isProvider = isSuperAdmin || roles.includes("provider");
  const isCustomer = isSuperAdmin || roles.includes("customer");

  return {
    roles,
    loading: loading || authLoading,
    hasRole: (role: AppRole) => isSuperAdmin || roles.includes(role),
    isSuperAdmin,
    isAdmin,
    isSupport,
    isEmployee,
    isProvider,
    isCustomer,
  };
}
