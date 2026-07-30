import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectDemoProviders } from "@/data/demo";


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
  /** Structured error code so UIs can render "temporarily unavailable" without
   *  leaking raw Postgres error text. `null` when the last call succeeded. */
  error: null | { code: "rpc_failed"; message: string };
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

    /** Dev/preview only: local fixtures so a surface never renders empty. */
    const demoFallback = (reason: string) => {
      const { rows, relaxed } = selectDemoProvidersWithMinimum(query, 4);
      if (DEMO_MODE && typeof console !== "undefined") {
        console.debug("[demo] marketplace fallback", {
          DEMO_MODE,
          reason,
          demoProvidersLoaded: DEMO_PROVIDERS_ALL.length,
          demoProvidersAfterFilters: selectDemoProviders(query).length,
          demoProvidersReturned: rows.length,
          relaxedFilters: relaxed,
          query,
        });
      }
      return rows;
    };

    if (error) {
      // Log for observability but never leak raw DB error text to the UI.
      if (typeof console !== "undefined") console.error("[marketplace] search_marketplace_providers_v1 failed", error);
      const demo = demoFallback("rpc_error");
      if (demo.length > 0) {
        setState({ data: demo, total: demo[0]?.total_count ?? demo.length, loading: false, error: null });
        return;
      }
      setState({ data: null, total: 0, loading: false, error: { code: "rpc_failed", message: error.message } });
      return;
    }
    let list = (data as MarketplaceProvider[] | null) ?? [];
    if (list.length === 0) {
      // Never show a blank marketplace during development.
      list = demoFallback("empty_live_result");
    }
    setState({ data: list, total: list[0]?.total_count ?? list.length, loading: false, error: null });



  }, [query.countryCode, query.serviceCategory, query.minTier, query.language, query.maxHourlyRate, query.search, query.sort, query.limit, query.offset]);

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
