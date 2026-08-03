/**
 * Centralised provider live-status resolver.
 *
 * Every surface (public profile, marketplace cards, booking flow) reads status
 * through this hook — never by deriving it locally. The authoritative source is
 * the `get_provider_live_status_v1` RPC, which reuses the existing calendar,
 * working hours and booking lifecycle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveProviderStatus,
  type ProviderLiveStatus,
  type ProviderLiveStatusRow,
} from "@/lib/providerStatus";

// The RPC is generated after types refresh; keep the call loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

/** Fire this after a booking/calendar mutation to refresh status immediately. */
export const PROVIDER_STATUS_REFRESH_EVENT = "mycleaner:provider-status-refresh";

export type ProviderStatusQuery = {
  /** Auth user ids of providers. */
  userIds?: (string | null | undefined)[];
  /** Public profile slugs. */
  slugs?: (string | null | undefined)[];
  enabled?: boolean;
};

function clean(list?: (string | null | undefined)[]) {
  const out = (list ?? []).filter((v): v is string => Boolean(v));
  return out.length ? Array.from(new Set(out)).sort() : null;
}

/**
 * Batch resolver. Returns a map keyed by BOTH user id and slug so callers can
 * look up whichever identifier they hold.
 */
export function useProviderLiveStatuses({ userIds, slugs, enabled = true }: ProviderStatusQuery) {
  const ids = useMemo(() => clean(userIds), [userIds]);
  const sl = useMemo(() => clean(slugs), [slugs]);
  const idsKey = ids?.join(",") ?? "";
  const slugKey = sl?.join(",") ?? "";

  const [rows, setRows] = useState<ProviderLiveStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled || (!idsKey && !slugKey)) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error: rpcError } = await rpc("get_provider_live_status_v1", {
      _provider_user_ids: idsKey ? idsKey.split(",") : null,
      _slugs: slugKey ? slugKey.split(",") : null,
    });
    if (!activeRef.current) return;
    if (rpcError) {
      setError("Status kunne ikke hentes lige nu.");
      setRows([]);
    } else {
      setError(null);
      setRows((data ?? []) as ProviderLiveStatusRow[]);
    }
    setLoading(false);
  }, [enabled, idsKey, slugKey]);

  useEffect(() => {
    activeRef.current = true;
    void load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  // Realtime: reuse the existing calendar/booking tables. A debounced refetch
  // keeps one source of truth instead of patching state client-side.
  useEffect(() => {
    if (!enabled || (!idsKey && !slugKey)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ping = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 600);
    };

    const channel = supabase
      .channel(`provider-live-status:${idsKey}|${slugKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_calendar_blocks" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_availability_rules" }, ping)
      .subscribe();

    // Presence must expire on its own: while any row still shows public
    // activity, refresh once a minute so "Online nu" cannot go stale.
    const poll = setInterval(() => void load(), 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PROVIDER_STATUS_REFRESH_EVENT, ping);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PROVIDER_STATUS_REFRESH_EVENT, ping);
      void supabase.removeChannel(channel);
    };
  }, [enabled, idsKey, slugKey, load]);

  const byKey = useMemo(() => {
    const map = new Map<string, ProviderLiveStatus>();
    for (const row of rows) {
      const resolved = resolveProviderStatus(row);
      if (!resolved) continue;
      if (row.provider_user_id) map.set(row.provider_user_id, resolved);
      if (row.provider_slug) map.set(row.provider_slug.toLowerCase(), resolved);
    }
    return map;
  }, [rows]);

  const get = useCallback(
    (key?: string | null) => (key ? (byKey.get(key) ?? byKey.get(key.toLowerCase()) ?? null) : null),
    [byKey],
  );

  return { statuses: byKey, get, loading, error, refresh: load };
}

/** Single-provider convenience wrapper. */
export function useProviderLiveStatus(
  identifier: { userId?: string | null; slug?: string | null },
  enabled = true,
) {
  const { userId, slug } = identifier;
  const { get, loading, error, refresh } = useProviderLiveStatuses({
    userIds: userId ? [userId] : undefined,
    slugs: slug ? [slug] : undefined,
    enabled,
  });
  const status = get(userId ?? null) ?? get(slug ?? null);
  return { status, loading, error, refresh };
}
