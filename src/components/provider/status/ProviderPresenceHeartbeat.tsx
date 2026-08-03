/**
 * Mounts the throttled provider presence heartbeat for signed-in providers.
 * Rendered once at app level so no page needs to know about presence.
 */
import { useUserRoles } from "@/hooks/useUserRoles";
import { useProviderPresenceHeartbeat } from "@/hooks/useProviderPresenceHeartbeat";

export function ProviderPresenceHeartbeat() {
  const { roles, loading } = useUserRoles();
  useProviderPresenceHeartbeat(!loading && roles.includes("provider"));
  return null;
}

export default ProviderPresenceHeartbeat;
