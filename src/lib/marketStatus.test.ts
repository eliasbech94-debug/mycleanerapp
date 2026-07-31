/**
 * Launch Market Safety Patch — market status tests.
 *
 * Guards:
 *  - DK is the only active/bookable market
 *  - DK uses DKK, server-provided
 *  - SE / GB / DE / ES are "coming soon" and never bookable
 *  - `UK` can never bypass `GB` status
 *  - unknown / manipulated codes fail safe
 */
import { describe, it, expect } from "vitest";
import {
  activeMarketCodes,
  comingSoonMarketCodes,
  indexMarketStatuses,
  isMarketBookable,
  marketAvailability,
  marketCurrency,
  normalizeCountryCode,
  type MarketStatusRow,
} from "./marketStatus";

// Mirrors the production rows of public.market_launch_status
const ROWS: MarketStatusRow[] = [
  { iso: "DK", lifecycle_state: "active", currency: "DKK", is_bookable: true },
  { iso: "SE", lifecycle_state: "development", currency: "SEK", is_bookable: false },
  { iso: "GB", lifecycle_state: "development", currency: "GBP", is_bookable: false },
  { iso: "DE", lifecycle_state: "development", currency: "EUR", is_bookable: false },
  { iso: "ES", lifecycle_state: "development", currency: "EUR", is_bookable: false },
];

const S = indexMarketStatuses(ROWS);

describe("launch market status", () => {
  it("DK is the only active market", () => {
    expect(activeMarketCodes(S)).toEqual(["DK"]);
  });

  it("DK is bookable and uses DKK", () => {
    expect(isMarketBookable(S, "DK")).toBe(true);
    expect(marketCurrency(S, "DK")).toBe("DKK");
    expect(marketAvailability(S, "DK")).toBe("active");
  });

  it.each(["SE", "GB", "DE", "ES"])("%s is coming soon and not bookable", (code) => {
    expect(isMarketBookable(S, code)).toBe(false);
    expect(marketAvailability(S, code)).toBe("coming_soon");
  });

  it("lists all four non-DK markets as coming soon", () => {
    expect(comingSoonMarketCodes(S)).toEqual(["DE", "ES", "GB", "SE"]);
  });

  it("UK cannot bypass GB status", () => {
    expect(normalizeCountryCode("UK")).toBe("GB");
    expect(normalizeCountryCode("uk")).toBe("GB");
    expect(isMarketBookable(S, "UK")).toBe(false);
    expect(marketAvailability(S, "uk")).toBe("coming_soon");
  });

  it("manipulated or unknown market codes fail safe", () => {
    for (const bad of ["", "  ", "XX", "DKK", "dk;--", null, undefined, "D", "DK1"]) {
      if (bad === "dk;--") expect(normalizeCountryCode(bad)).toBeNull();
      expect(isMarketBookable(S, bad as string)).toBe(bad?.trim?.().toUpperCase() === "DK");
    }
  });

  it("treats an empty server response as nothing bookable", () => {
    const empty = indexMarketStatuses([]);
    expect(activeMarketCodes(empty)).toEqual([]);
    expect(isMarketBookable(empty, "DK")).toBe(false);
  });

  it("lowercase and padded DK still resolves", () => {
    expect(isMarketBookable(S, " dk ")).toBe(true);
  });
});
