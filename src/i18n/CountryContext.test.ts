import { describe, it, expect } from "vitest";
import { isValidCountryParam, SUPPORTED_COUNTRIES } from "@/i18n/CountryContext";

describe("country param validation", () => {
  it("accepts lowercase supported ISO codes", () => {
    for (const iso of SUPPORTED_COUNTRIES) {
      expect(isValidCountryParam(iso.toLowerCase())).toBe(true);
    }
  });
  it("rejects unknown codes", () => {
    expect(isValidCountryParam("us")).toBe(false);
    expect(isValidCountryParam("no")).toBe(false);
    expect(isValidCountryParam("xx")).toBe(false);
  });
  it("rejects empty / undefined", () => {
    expect(isValidCountryParam(undefined)).toBe(false);
    expect(isValidCountryParam("")).toBe(false);
  });
});
