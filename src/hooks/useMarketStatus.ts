/**
 * useMarketStatus — reads the server-managed market lifecycle status.
 *
 * Source of truth: `public.market_launch_status`.
 * The client keeps NO hardcoded list of active markets. Until the server
 * answers, every market is treated as "coming soon" (fail-safe).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  activeMarketCodes,
  comingSoonMarketCodes,
  indexMarketStatuses,
  isMarketBookable,
  marketCurrency,
  type MarketStatus,
  type MarketStatusRow,
} from "@/lib/marketStatus";

let cache: Record<string, MarketStatus> | null = null;
let inflight: Promise<Record<string, MarketStatus>> | null = null;

export function __resetMarketStatusCache() {
  cache = null;
  inflight = null;
}

async function load(): Promise<Record<string, MarketStatus>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase
        .from("market_launch_status" as never)
        .select("iso,lifecycle_state,currency,is_bookable");
      if (error || !data) return {};
      const idx = indexMarketStatuses(data as unknown as MarketStatusRow[]);
      cache = idx;
      return idx;
    })();
  }
  return inflight;
}

export function useMarketStatus() {
  const [statuses, setStatuses] = useState<Record<string, MarketStatus>>(cache ?? {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    void load().then((s) => {
      if (cancelled) return;
      setStatuses(s);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return {
    statuses,
    loading,
    activeCodes: activeMarketCodes(statuses),
    comingSoonCodes: comingSoonMarketCodes(statuses),
    isBookable: (code?: string | null) => isMarketBookable(statuses, code),
    currencyFor: (code?: string | null) => marketCurrency(statuses, code),
  };
}
