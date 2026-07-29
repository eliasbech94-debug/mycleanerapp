/**
 * Service pricing adapter for the public provider profile.
 *
 * TARGET SHAPE (provider_service_prices — PR #36):
 *   service_code, amount_minor, currency, price_model ("hourly" | "fixed" | "from"),
 *   min_duration_minutes, surcharges[], is_active
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TEMPORARY FALLBACK — REMOVE WHEN provider_service_prices IS MERGED ⚠️
 * Until that table exists, `get_public_provider_profile_v2` returns the legacy
 * shape { service_code, amount_minor, currency, unit }. `normalizeService()`
 * maps that legacy shape onto the target shape below. When the real table is
 * live, delete `legacyUnitToPriceModel` + the fallback branches — the rest of
 * this file and every consumer already speaks the target shape.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { PublicProviderService, ServicePriceModel } from "./types";
import { formatMoney } from "./format";

/** TEMPORARY: legacy `unit` column → price model. Delete with the fallback. */
export function legacyUnitToPriceModel(unit: string | null | undefined): ServicePriceModel {
  return unit === "job" ? "from" : "hourly";
}

export type NormalizedService = {
  service_code: string;
  amount_minor: number;
  currency: string;
  price_model: ServicePriceModel;
  min_duration_minutes: number | null;
  surcharges: { label: string; amount_minor?: number | null; percent?: number | null }[];
  is_active: boolean;
  /** True while the row came from the legacy fallback rather than provider_service_prices. */
  is_fallback_pricing: boolean;
};

export function normalizeService(s: PublicProviderService): NormalizedService {
  const hasRealPricing = s.price_model != null;
  return {
    service_code: s.service_code,
    amount_minor: s.amount_minor,
    currency: s.currency,
    price_model: hasRealPricing ? (s.price_model as ServicePriceModel) : legacyUnitToPriceModel(s.unit),
    min_duration_minutes: s.min_duration_minutes ?? null,
    surcharges: Array.isArray(s.surcharges) ? s.surcharges : [],
    // Legacy rows have no active flag; they are only returned when offered.
    is_active: s.is_active ?? true,
    is_fallback_pricing: !hasRealPricing,
  };
}

/** Only services the provider actively offers. */
export function activeServices(services: PublicProviderService[] | null | undefined): NormalizedService[] {
  return (Array.isArray(services) ? services : []).map(normalizeService).filter((s) => s.is_active);
}

export function priceLabel(s: NormalizedService, locale = "da-DK"): string {
  const money = formatMoney(s.amount_minor, s.currency, locale);
  if (s.price_model === "hourly") return `${money}/time`;
  if (s.price_model === "from") return `Fra ${money}`;
  return money;
}

export function minDurationLabel(s: NormalizedService): string | null {
  const m = s.min_duration_minutes;
  if (!m || m <= 0) return null;
  if (m % 60 === 0) return `Min. ${m / 60} time${m / 60 === 1 ? "" : "r"}`;
  return `Min. ${m} min.`;
}

export function surchargeLabel(
  sc: { label: string; amount_minor?: number | null; percent?: number | null },
  currency: string,
  locale = "da-DK",
): string {
  if (sc.percent != null) return `${sc.label} +${sc.percent}%`;
  if (sc.amount_minor != null) return `${sc.label} +${formatMoney(sc.amount_minor, currency, locale)}`;
  return sc.label;
}
