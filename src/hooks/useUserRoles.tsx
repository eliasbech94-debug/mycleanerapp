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

/**
 * Several components mount this hook at the same time. Realtime topics must be
 * unique per subscription, otherwise supabase-js rejects the second listener
 * with "cannot add `postgres_changes` callbacks after `subscribe()`".
 */
let roleChannelSeq = 0;

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

    if (!user) {
      return () => {
        cancelled = true;
      };
    }

    // A role change must take effect without a manual reload: re-validate the
    // session (it may have been revoked server-side) and refetch roles.
    async function revalidate() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        await supabase.auth.signOut();
        return;
      }
      await load();
    }

    const channel = supabase
      .channel(`user-roles-${user.id}-${++roleChannelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        () => void revalidate(),
      )
      .subscribe();

    const onFocus = () => void revalidate();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
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
