import { describe, it, expect } from "vitest";
import { legalFallbackTiers } from "./legalAcceptance";

describe("legalFallbackTiers", () => {
  it("returns country+lang, country+en, GLOBAL+en for a non-english locale", () => {
    expect(legalFallbackTiers("DK", "da")).toEqual([
      { country: "DK", language: "da" },
      { country: "DK", language: "en" },
      { country: "GLOBAL", language: "en" },
    ]);
  });

  it("skips duplicate country+en tier when language is already en", () => {
    expect(legalFallbackTiers("GB", "en")).toEqual([
      { country: "GB", language: "en" },
      { country: "GLOBAL", language: "en" },
    ]);
  });

  it("uppercases country and lowercases language", () => {
    expect(legalFallbackTiers("se", "SV")).toEqual([
      { country: "SE", language: "sv" },
      { country: "SE", language: "en" },
      { country: "GLOBAL", language: "en" },
    ]);
  });

  it("does not append GLOBAL twice when already GLOBAL", () => {
    expect(legalFallbackTiers("GLOBAL", "en")).toEqual([
      { country: "GLOBAL", language: "en" },
    ]);
  });

  it("defaults to DK/da when inputs are empty", () => {
    expect(legalFallbackTiers("", "")).toEqual([
      { country: "DK", language: "da" },
      { country: "DK", language: "en" },
      { country: "GLOBAL", language: "en" },
    ]);
  });
});
