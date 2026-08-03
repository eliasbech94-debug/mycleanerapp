/**
 * Launch Market Safety — market availability is SERVER-DRIVEN.
 *
 * The frontend must never keep its own list of "active" markets. Availability
 * is derived from `public.market_launch_status` (a safe projection of
 * `country_configs.lifecycle_state` / `active` / `status`).
 *
 * This module only contains pure helpers so it can be unit tested without
 * network access.
 */

export type MarketLifecycleState =
  | "development"
  | "beta"
  | "launch_ready"
  | "active"
  | "suspended"
  | "retired";

export type MarketStatusRow = {
  iso: string;
  lifecycle_state: MarketLifecycleState | string;
  currency: string;
  is_bookable: boolean;
};

export type MarketAvailability = "active" | "coming_soon";

export type MarketStatus = {
  code: string;              // canonical ISO-3166 alpha-2
  currency: string;          // ISO-4217, server-provided
  availability: MarketAvailability;
  bookable: boolean;
};

/**
 * Canonicalise a country code. `UK` is NOT a valid ISO-3166 alpha-2 code and
 * must never be usable as an alternative spelling that bypasses GB status.
 */
export function normalizeCountryCode(code?: string | null): string | null {
  if (!code) return null;
  const up = String(code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(up)) return null;
  if (up === "UK") return "GB";
  return up;
}

export function toMarketStatus(row: MarketStatusRow): MarketStatus {
  const code = normalizeCountryCode(row.iso);
  return {
    code: code ?? String(row.iso).toUpperCase(),
    currency: String(row.currency || "").toUpperCase(),
    availability: row.is_bookable ? "active" : "coming_soon",
    bookable: Boolean(row.is_bookable),
  };
}

export function indexMarketStatuses(rows: MarketStatusRow[]): Record<string, MarketStatus> {
  const out: Record<string, MarketStatus> = {};
  for (const r of rows) {
    const s = toMarketStatus(r);
    out[s.code] = s;
  }
  return out;
}

/** Fail-safe: an unknown market is never bookable. */
export function isMarketBookable(
  statuses: Record<string, MarketStatus>,
  code?: string | null,
): boolean {
  const c = normalizeCountryCode(code);
  if (!c) return false;
  return statuses[c]?.bookable === true;
}

export function marketAvailability(
  statuses: Record<string, MarketStatus>,
  code?: string | null,
): MarketAvailability {
  return isMarketBookable(statuses, code) ? "active" : "coming_soon";
}

/** Server-provided currency for a market. Never guessed client-side. */
export function marketCurrency(
  statuses: Record<string, MarketStatus>,
  code?: string | null,
): string | null {
  const c = normalizeCountryCode(code);
  if (!c) return null;
  return statuses[c]?.currency || null;
}

export function activeMarketCodes(statuses: Record<string, MarketStatus>): string[] {
  return Object.values(statuses).filter((s) => s.bookable).map((s) => s.code).sort();
}

export function comingSoonMarketCodes(statuses: Record<string, MarketStatus>): string[] {
  return Object.values(statuses).filter((s) => !s.bookable).map((s) => s.code).sort();
}
