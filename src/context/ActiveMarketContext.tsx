/**
 * ActiveMarketContext — canonical, homepage-wide active market.
 *
 * Priority (highest → lowest):
 *   1. Booking / service address country (customer_addresses primary)      — overrides all
 *   2. Saved user market (profiles.country_code)
 *   3. Explicit selector choice (localStorage: mc.market.explicit)
 *   4. Browser locale suggestion
 *   5. Neutral Europe-wide fallback (market = NEUTRAL_MARKET, isNeutral=true)
 *
 * Every homepage surface (feed, provider grid, map, metrics, currency)
 * MUST derive its content from this context — never hardcode a country.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Market, MARKETS, NEUTRAL_MARKET, marketByCode, marketFromLocale } from "@/lib/markets";

type Source =
  | "booking_address"
  | "user_profile"
  | "explicit"
  | "locale"
  | "neutral";

interface ActiveMarketValue {
  market: Market;             // never null — falls back to NEUTRAL_MARKET
  isNeutral: boolean;         // true when no reliable market was resolved
  source: Source;
  markets: Market[];
  /** User picks a market via the selector — persisted as explicit choice. */
  setMarket: (m: Market) => void;
  /** Drop the explicit choice and re-resolve from higher-priority signals. */
  clearExplicit: () => void;
}

const Ctx = createContext<ActiveMarketValue | null>(null);

const EXPLICIT_KEY = "mc.market.explicit";

function readExplicit(): string | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(EXPLICIT_KEY);
  return v && marketByCode(v) ? v : null;
}

export function ActiveMarketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profileCode, setProfileCode] = useState<string | null>(null);
  const [addressCode, setAddressCode] = useState<string | null>(null);
  const [explicitCode, setExplicitCode] = useState<string | null>(() => readExplicit());
  const [loaded, setLoaded] = useState(false);

  // Load user-scoped signals once per auth change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) { setProfileCode(null); setAddressCode(null); setLoaded(true); }
        return;
      }
      const [{ data: prof }, { data: addr }] = await Promise.all([
        supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("address_country_code,is_primary,updated_at")
          .eq("user_id", user.id)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setProfileCode((prof as { country_code?: string | null } | null)?.country_code ?? null);
      setAddressCode((addr as { address_country_code?: string | null } | null)?.address_country_code ?? null);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Re-sync explicit choice across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === EXPLICIT_KEY) setExplicitCode(readExplicit());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { market, source, isNeutral } = useMemo<{ market: Market; source: Source; isNeutral: boolean }>(() => {
    // 1. Booking / service address — highest priority per product spec.
    const byAddress = marketByCode(addressCode);
    if (byAddress) return { market: byAddress, source: "booking_address", isNeutral: false };

    // 2. Saved user profile market.
    const byProfile = marketByCode(profileCode);
    if (byProfile) return { market: byProfile, source: "user_profile", isNeutral: false };

    // 3. Explicit selector choice.
    const byExplicit = marketByCode(explicitCode);
    if (byExplicit) return { market: byExplicit, source: "explicit", isNeutral: false };

    // 4. Browser locale (suggestion only — never overrides an explicit choice).
    const byLocale = typeof navigator !== "undefined" ? marketFromLocale(navigator.language) : null;
    if (byLocale) return { market: byLocale, source: "locale", isNeutral: false };

    // 5. Neutral Europe-wide fallback.
    return { market: NEUTRAL_MARKET, source: "neutral", isNeutral: true };
  }, [addressCode, profileCode, explicitCode]);

  const setMarket = useCallback((m: Market) => {
    try { localStorage.setItem(EXPLICIT_KEY, m.code); } catch { /* ignore */ }
    setExplicitCode(m.code);
  }, []);

  const clearExplicit = useCallback(() => {
    try { localStorage.removeItem(EXPLICIT_KEY); } catch { /* ignore */ }
    setExplicitCode(null);
  }, []);

  const value: ActiveMarketValue = {
    market,
    isNeutral,
    source,
    markets: MARKETS,
    setMarket,
    clearExplicit,
  };

  // Avoid a first-paint flash of the wrong market for authenticated users:
  // while user-scoped signals load, render children with whatever resolves
  // from lower-priority signals; downstream components tolerate re-render.
  void loaded;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveMarket(): ActiveMarketValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveMarket must be used inside <ActiveMarketProvider>");
  return v;
}
