import { describe, expect, it } from "vitest";
import { buildSeoTags, isPrivateRoute, stripCountryPrefix } from "./seo";
import type { CountryPublic } from "./CountryContext";

const active: CountryPublic[] = [
  { iso: "DK", active: true, launch_status: "active", default_language: "da",
    supported_languages: ["da","en"], currency: "DKK", timezone: "Europe/Copenhagen",
    booking_public: {}, payment_methods_public: [], contact_public: {},
    feature_availability_public: {}, legal_references_public: [] },
];

describe("SEO helper", () => {
  it("emits noindex on private routes", () => {
    const tags = buildSeoTags({ path: "/admin", activeCountries: active, currentIso: "DK", currentLang: "en", title: "x", description: "y" });
    expect(tags.some(t => t.attrs.name === "robots" && String(t.attrs.content).includes("noindex"))).toBe(true);
  });
  it("emits canonical for known indexable country", () => {
    const tags = buildSeoTags({ path: "/dk/faq", activeCountries: active, currentIso: "DK", currentLang: "da", title: "FAQ", description: "d" });
    const canonical = tags.find(t => t.attrs.rel === "canonical");
    expect(canonical?.attrs.href).toBe("https://mycleaner.dk/dk/faq");
  });
  it("does NOT emit canonical when country is not indexable", () => {
    const tags = buildSeoTags({ path: "/es/faq", activeCountries: active, currentIso: "ES", currentLang: "es", title: "x", description: "y" });
    expect(tags.find(t => t.attrs.rel === "canonical")).toBeUndefined();
    expect(tags.some(t => t.attrs.name === "robots")).toBe(true);
  });
  it("strips country prefix", () => {
    expect(stripCountryPrefix("/dk/faq")).toEqual({ iso: "DK", rest: "/faq" });
    expect(stripCountryPrefix("/faq")).toEqual({ iso: null, rest: "/faq" });
  });
  it("classifies private routes", () => {
    expect(isPrivateRoute("/admin/countries")).toBe(true);
    expect(isPrivateRoute("/book/abc")).toBe(true);
    expect(isPrivateRoute("/faq")).toBe(false);
  });
});
