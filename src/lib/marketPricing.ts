// Client helpers for the isolated marketplace pricing module (advisory only).
// Never wired into checkout, bookings or payouts.
import { supabase } from "@/integrations/supabase/client";

export type IndicatorLevel = "very_competitive" | "recommended" | "premium" | "high";
export type MatchedScope = "postcode" | "city" | "region" | "country";
export type DemandLevel = "low" | "normal" | "high";
export type Confidence = "low" | "medium" | "high";

export interface ResolvedMarket {
  matched_scope: MatchedScope | null;
  country_code: string;
  currency: string | null;
  region: string | null;
  city: string | null;
  postcode: string | null;
  min_minor: number | null;
  max_minor: number | null;
  recommended_minor: number | null;
  error?: string;
}

export interface AppliedMultiplier {
  key: string;
  label: string | null;
  bps: number;
}

export interface Recommendation {
  currency: string;
  recommended_minor: number;
  base_recommended_minor: number;
  nearby_avg_minor: number;
  demand_level: DemandLevel;
  competition_score: number;
  indicator: IndicatorLevel;
  matched_scope: MatchedScope;
  method: string;
  data_confidence: Confidence;
  sample_size: number;
  fallback_reason: string | null;
  applied_multipliers: AppliedMultiplier[];
  multiplier_bps_total: number;
  signals: Record<string, unknown>;
  disclaimer: string;
  error?: string;
}

export interface ProviderPreferences {
  user_id: string;
  country_code: string;
  currency: string;
  region: string | null;
  city: string | null;
  postcode: string | null;
  hourly_rate_minor: number;
  smart_pricing_enabled: boolean;
  smart_min_minor: number | null;
  smart_max_minor: number | null;
  matched_scope: MatchedScope | null;
  resolved_min_minor: number | null;
  resolved_max_minor: number | null;
  updated_at: string;
}

export async function resolveMarket(input: {
  country_code: string;
  region?: string | null;
  city?: string | null;
  postcode?: string | null;
}): Promise<ResolvedMarket> {
  const { data, error } = await supabase.rpc("resolve_market_minimum", {
    _country_code: input.country_code,
    _region: input.region ?? null,
    _city: input.city ?? null,
    _postcode: input.postcode ?? null,
  });
  if (error) throw error;
  return data as unknown as ResolvedMarket;
}

export async function saveProviderPricing(payload: {
  country_code: string;
  region?: string | null;
  city?: string | null;
  postcode?: string | null;
  hourly_rate_minor: number;
  smart_pricing_enabled: boolean;
  smart_min_minor?: number | null;
  smart_max_minor?: number | null;
  user_id?: string; // admin-only
}): Promise<{ ok: true; currency: string; hourly_rate_minor: number; resolved: ResolvedMarket }> {
  const { data, error } = await supabase.rpc("save_provider_pricing", { _payload: payload as never });
  if (error) throw error;
  return data as unknown as { ok: true; currency: string; hourly_rate_minor: number; resolved: ResolvedMarket };
}

export async function getRecommendation(userId: string): Promise<Recommendation> {
  const { data, error } = await supabase.rpc("compute_recommended_price", { _user_id: userId });
  if (error) throw error;
  return data as unknown as Recommendation;
}

export async function fetchOwnPreferences(userId: string): Promise<ProviderPreferences | null> {
  const { data, error } = await supabase
    .from("provider_pricing_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProviderPreferences | null;
}

export function classifyIndicator(hourlyMinor: number, recommendedMinor: number): IndicatorLevel {
  if (hourlyMinor < recommendedMinor * 0.9) return "very_competitive";
  if (hourlyMinor <= recommendedMinor * 1.05) return "recommended";
  if (hourlyMinor <= recommendedMinor * 1.2) return "premium";
  return "high";
}

export const INDICATOR_META: Record<IndicatorLevel, { label: string; className: string; emoji: string }> = {
  very_competitive: { label: "Very competitive", className: "bg-emerald-500 text-white",  emoji: "🟢" },
  recommended:      { label: "Recommended",       className: "bg-yellow-500 text-black",  emoji: "🟡" },
  premium:          { label: "Premium",           className: "bg-orange-500 text-white",  emoji: "🟠" },
  high:             { label: "High price",        className: "bg-red-500 text-white",     emoji: "🔴" },
};

export const DEMAND_META: Record<DemandLevel, { label: string; className: string }> = {
  low:    { label: "Low demand",    className: "bg-muted text-muted-foreground" },
  normal: { label: "Balanced",      className: "bg-secondary text-secondary-foreground" },
  high:   { label: "High demand",   className: "bg-primary/15 text-primary" },
};

export function formatMinor(minor: number | null | undefined, currency: string | null | undefined) {
  if (minor == null || !currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 })
      .format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

/** Client-side mirror of the server validation. Used for live UI feedback ONLY;
 *  the server is always the source of truth. */
export function validatePricingDraft(input: {
  hourly_minor: number;
  smart_enabled: boolean;
  smart_min_minor: number | null;
  smart_max_minor: number | null;
  market: ResolvedMarket | null;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const { hourly_minor, smart_enabled, smart_min_minor, smart_max_minor, market } = input;
  if (!market || market.error) errors.push("no_active_market_rule");
  const rmin = market?.min_minor ?? null;
  const rmax = market?.max_minor ?? null;
  if (!hourly_minor || hourly_minor <= 0) errors.push("invalid_hourly_rate");
  if (rmin != null && hourly_minor > 0 && hourly_minor < rmin) errors.push("below_market_minimum");
  if (rmax != null && hourly_minor > rmax) errors.push("above_market_maximum");
  if (smart_enabled) {
    if (smart_min_minor == null || smart_max_minor == null) errors.push("smart_bounds_required");
    else {
      if (rmin != null && smart_min_minor < rmin) errors.push("smart_min_below_market");
      if (rmax != null && smart_max_minor > rmax) errors.push("smart_max_above_market");
      if (smart_max_minor < smart_min_minor) errors.push("smart_max_below_min");
    }
  }
  return { ok: errors.length === 0, errors };
}
