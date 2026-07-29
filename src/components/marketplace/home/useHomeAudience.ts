import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";

export type HomeAudience = "guest" | "customer" | "provider";

/**
 * Experience Engine — resolves which homepage variant to render for the
 * current viewer. Everything must still work with no personalization
 * enabled, so we return `guest` while auth/roles are loading and default
 * to `customer` for any signed-in non-provider account.
 *
 * Downstream sections may further scope their visibility via config; this
 * hook only exposes the coarse audience bucket.
 */
export function useHomeAudience(): { audience: HomeAudience; ready: boolean } {
  const { user, loading: authLoading } = useAuth();
  const { isProvider, loading: rolesLoading } = useUserRoles();
  const ready = !authLoading && !rolesLoading;
  if (!user) return { audience: "guest", ready };
  if (isProvider) return { audience: "provider", ready };
  return { audience: "customer", ready };
}
