import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared marketplace provider search.
 * Wraps `search_marketplace_providers_v1` so Homepage, Marketplace and
 * FindCleaner never diverge on filter shape, sort keys or realtime behaviour.
 * Cancels stale requests via a request-id guard and debounces filter changes.
 */
export type MarketplaceProvider = {
  provider_slug: string;
  display_name: string;
  avatar_url: string | null;
  marketplace_score: number | null;
  provider_tier: string;
  country_code: string | null;
  service_categories: string[] | null;
  price_from: number | null;
  service_radius_km: number | null;
  public_bio: string | null;
  avg_response_minutes: number | null;
  identity_verified_badge: boolean;
  average_rating: number;
  total_reviews: number;
  completed_bookings: number;
  total_count: number;
};

export type MarketplaceQuery = {
  countryCode?: string | null;
  serviceCategory?: string | null;
  minTier?: string | null;
  language?: string | null;
  maxHourlyRate?: number | null;
  search?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
};

type State = {
  data: MarketplaceProvider[] | null;
  total: number;
  loading: boolean;
  error: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

export function useMarketplaceProviders(query: MarketplaceQuery, opts?: { realtime?: boolean; debounceMs?: number }) {
  const [state, setState] = useState<State>({ data: null, total: 0, loading: true, error: null });
  const reqIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = JSON.stringify(query);

  const load = useCallback(async () => {
    const id = ++reqIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await rpc("search_marketplace_providers_v1", {
      _country_code: query.countryCode ?? null,
      _service_category: query.serviceCategory ?? null,
      _min_tier: query.minTier ?? null,
      _language: query.language ?? null,
      _max_hourly_rate: query.maxHourlyRate ?? null,
      _search: query.search ?? null,
      _sort: query.sort ?? "score",
      _limit: query.limit ?? 12,
      _offset: query.offset ?? 0,
    });
    // Drop stale response
    if (id !== reqIdRef.current) return;
    if (error) {
      setState({ data: [], total: 0, loading: false, error: error.message });
      return;
    }
    const list = (data as MarketplaceProvider[] | null) ?? [];
    setState({ data: list, total: list[0]?.total_count ?? 0, loading: false, error: null });
  }, [query.countryCode, query.serviceCategory, query.minTier, query.language, query.maxHourlyRate, query.search, query.sort, query.limit, query.offset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ms = opts?.debounceMs ?? 200;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void load(); }, ms);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!opts?.realtime) return;
    const ch = supabase
      .channel(`mkt-providers-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_profiles" }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.realtime]);

  return { ...state, refetch: load };
}
