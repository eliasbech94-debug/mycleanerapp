import { describe, it, expect } from "vitest";
import { validatePricingDraft, classifyIndicator, type ResolvedMarket } from "./marketPricing";

const market = (over: Partial<ResolvedMarket> = {}): ResolvedMarket => ({
  matched_scope: "country", country_code: "DK", currency: "DKK",
  region: null, city: null, postcode: null,
  min_minor: 25000, max_minor: 60000, recommended_minor: 30000, ...over,
});

describe("validatePricingDraft", () => {
  it("passes with hourly inside market band", () => {
    const v = validatePricingDraft({
      hourly_minor: 30000, smart_enabled: false,
      smart_min_minor: null, smart_max_minor: null, market: market(),
    });
    expect(v.ok).toBe(true);
  });

  it("flags below-minimum", () => {
    const v = validatePricingDraft({
      hourly_minor: 20000, smart_enabled: false,
      smart_min_minor: null, smart_max_minor: null, market: market(),
    });
    expect(v.errors).toContain("below_market_minimum");
  });

  it("flags above-maximum", () => {
    const v = validatePricingDraft({
      hourly_minor: 70000, smart_enabled: false,
      smart_min_minor: null, smart_max_minor: null, market: market(),
    });
    expect(v.errors).toContain("above_market_maximum");
  });

  it("requires smart bounds when smart enabled", () => {
    const v = validatePricingDraft({
      hourly_minor: 30000, smart_enabled: true,
      smart_min_minor: null, smart_max_minor: null, market: market(),
    });
    expect(v.errors).toContain("smart_bounds_required");
  });

  it("rejects smart min below market min and inverted bounds", () => {
    const v = validatePricingDraft({
      hourly_minor: 30000, smart_enabled: true,
      smart_min_minor: 10000, smart_max_minor: 5000, market: market(),
    });
    expect(v.errors).toEqual(expect.arrayContaining(["smart_min_below_market", "smart_max_below_min"]));
  });

  it("rejects smart max above market max", () => {
    const v = validatePricingDraft({
      hourly_minor: 30000, smart_enabled: true,
      smart_min_minor: 25000, smart_max_minor: 90000, market: market(),
    });
    expect(v.errors).toContain("smart_max_above_market");
  });

  it("errors when no active market rule", () => {
    const v = validatePricingDraft({
      hourly_minor: 30000, smart_enabled: false,
      smart_min_minor: null, smart_max_minor: null, market: null,
    });
    expect(v.errors).toContain("no_active_market_rule");
  });
});

describe("classifyIndicator", () => {
  const rec = 30000;
  it("flags very_competitive < 90%", () => expect(classifyIndicator(26000, rec)).toBe("very_competitive"));
  it("flags recommended within 90-105%", () => expect(classifyIndicator(30000, rec)).toBe("recommended"));
  it("flags premium within 105-120%", () => expect(classifyIndicator(34000, rec)).toBe("premium"));
  it("flags high above 120%", () => expect(classifyIndicator(40000, rec)).toBe("high"));
});
