import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Shared favorite-provider state built on `toggle_favorite_by_slug_v1`.
 * - Handles logged-out users (prompt to sign in, no RPC call).
 * - Optimistic update + rollback on failure.
 * - Per-slug in-flight guard so duplicate clicks are ignored.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

export function useFavoriteProviders() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) { setIds(new Set()); setReady(true); return; }
    const { data } = await rpc("list_favorite_providers_v1");
    setIds(new Set(((data as { provider_slug: string }[] | null) ?? []).map((r) => r.provider_slug)));
    setReady(true);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const isFavorite = useCallback((slug: string) => ids.has(slug), [ids]);

  const toggle = useCallback(async (slug: string) => {
    if (!user) { toast.info("Log ind for at gemme favoritter"); return; }
    if (inFlight.current.has(slug)) return;
    inFlight.current.add(slug);

    const wasFav = ids.has(slug);
    setIds((s) => { const n = new Set(s); if (wasFav) n.delete(slug); else n.add(slug); return n; });

    const { error } = await rpc("toggle_favorite_by_slug_v1", { _slug: slug });
    inFlight.current.delete(slug);
    if (error) {
      // Rollback
      setIds((s) => { const n = new Set(s); if (wasFav) n.add(slug); else n.delete(slug); return n; });
      toast.error(error.message);
    }
  }, [ids, user]);

  return { isFavorite, toggle, ids, ready, refresh, isPending: (slug: string) => inFlight.current.has(slug) };
}
