/**
 * Admin Live Status analytics.
 *
 * Reads the server-side status event history (`admin_live_status_analytics_v1`).
 * The RPC enforces admin/super_admin/support authorisation — the UI never
 * queries `provider_status_events` or `provider_presence` directly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

export type LiveStatusRangeKey = "today" | "7d" | "30d" | "custom";

export type LiveStatusFilters = {
  range: LiveStatusRangeKey;
  from?: string;
  to?: string;
  country?: string | null;
  city?: string | null;
  providerUserId?: string | null;
  status?: string | null;
};

export type LiveStatusAnalytics = {
  generated_at: string;
  range: { from: string; to: string };
  current: {
    available: number;
    busy: number;
    travelling: number;
    off_hours: number;
    unavailable: number;
    online_now: number;
    total: number;
  };
  median_status_duration_minutes: number | null;
  avg_available_minutes_per_provider: number | null;
  pct_accepted_while_available: number | null;
  avg_response_minutes_while_online: number | null;
  transitions: number;
  by_hour: Array<Record<string, string | number>>;
  by_country: Array<Record<string, string | number>>;
  by_city: Array<Record<string, string | number>>;
  recent_events: Array<{
    id: string;
    provider_user_id: string;
    previous_status: string | null;
    new_status: string;
    source: string;
    booking_id: string | null;
    presence_state: string | null;
    country_code: string | null;
    created_at: string;
  }>;
};

export function resolveRange(filters: LiveStatusFilters): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (filters.range === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (filters.range === "7d") {
    from.setDate(from.getDate() - 7);
  } else if (filters.range === "30d") {
    from.setDate(from.getDate() - 30);
  } else {
    return {
      from: filters.from ? new Date(filters.from).toISOString() : from.toISOString(),
      to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : to.toISOString(),
    };
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useLiveStatusAnalytics(filters: LiveStatusFilters) {
  const [data, setData] = useState<LiveStatusAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(() => JSON.stringify(filters), [filters]);

  const load = useCallback(async () => {
    const parsed = JSON.parse(key) as LiveStatusFilters;
    const { from, to } = resolveRange(parsed);
    setLoading(true);
    const { data: res, error: rpcError } = await rpc("admin_live_status_analytics_v1", {
      _from: from,
      _to: to,
      _country: parsed.country || null,
      _city: parsed.city || null,
      _provider_user_id: parsed.providerUserId || null,
      _status: parsed.status || null,
    });
    if (rpcError) {
      setError("Analysen kunne ikke hentes.");
      setData(null);
    } else {
      setError(null);
      setData(res as LiveStatusAnalytics);
    }
    setLoading(false);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
