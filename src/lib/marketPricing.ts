// Client helpers for the isolated marketplace pricing module (advisory only).
// Never wired into checkout, bookings, or payouts.
import { supabase } from "@/integrations/supabase/client";

export type IndicatorLevel = "very_competitive" | "recommended" | "premium" | "high";
export type MatchedScope = "postcode" | "city" | "region" | "country";

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

export interface Recommendation {
  currency: string;
  recommended_minor: number;
  nearby_avg_minor: number;
  demand_level: "low" | "normal" | "high";
  competition_score: number;
  indicator: IndicatorLevel;
  matched_scope: MatchedScope;
  method: string;
  data_confidence: "low" | "medium" | "high";
  sample_size: number;
  fallback_reason: string | null;
  signals: Record<string, unknown>;
  disclaimer: string;
  error?: string;
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
}) {
  const { data, error } = await supabase.rpc("save_provider_pricing", { _payload: payload as never });
  if (error) throw error;
  return data as unknown as { ok: true; currency: string; hourly_rate_minor: number; resolved: ResolvedMarket };
}

export async function getRecommendation(userId: string): Promise<Recommendation> {
  const { data, error } = await supabase.rpc("compute_recommended_price", { _user_id: userId });
  if (error) throw error;
  return data as unknown as Recommendation;
}

export function classifyIndicator(hourlyMinor: number, recommendedMinor: number): IndicatorLevel {
  if (hourlyMinor < recommendedMinor * 0.9) return "very_competitive";
  if (hourlyMinor <= recommendedMinor * 1.05) return "recommended";
  if (hourlyMinor <= recommendedMinor * 1.2) return "premium";
  return "high";
}

export const INDICATOR_META: Record<IndicatorLevel, { label: string; color: string; emoji: string }> = {
  very_competitive: { label: "Very competitive", color: "bg-emerald-500", emoji: "🟢" },
  recommended:      { label: "Recommended",       color: "bg-yellow-500",  emoji: "🟡" },
  premium:          { label: "Premium",           color: "bg-orange-500",  emoji: "🟠" },
  high:             { label: "High price",        color: "bg-red-500",     emoji: "🔴" },
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
