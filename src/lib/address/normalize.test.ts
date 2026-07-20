import { describe, it, expect } from "vitest";
import { normalizeAddress, matchSpan } from "./normalize";

describe("normalizeAddress", () => {
  it("lower-cases input", () => {
    expect(normalizeAddress("Sønder Boulevard")).toBe("soender boulevard");
  });

  it("transliterates æ/ø/å", () => {
    expect(normalizeAddress("Ærø")).toBe("aeroe");
    expect(normalizeAddress("Åhus")).toBe("aahus");
  });

  it("also handles German-style ä/ö when pasted", () => {
    expect(normalizeAddress("Ärö")).toBe("aeroe");
  });

  it("strips commas, dots, semicolons but keeps floor tokens", () => {
    expect(normalizeAddress("Sønder Boulevard 18, 1. tv")).toBe("soender boulevard 18 1 tv");
  });

  it("collapses excess whitespace", () => {
    expect(normalizeAddress("  Sønder    Boulevard  18  ")).toBe("soender boulevard 18");
  });

  it("normalizes the canonical spelling deterministically (fuzzy input is DAWA's job server-side)", () => {
    // Both go through transliteration → "soender boulevard 18" for the ø form,
    // and "sonder boulevard 18" for the ASCII form. They intentionally differ:
    // fuzzy resolution is delegated to DAWA's `fuzzy` search flag, not local hashing.
    expect(normalizeAddress("Sønder Boulevard 18")).toBe("soender boulevard 18");
    expect(normalizeAddress("sonder boulevard 18")).toBe("sonder boulevard 18");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeAddress("")).toBe("");
  });
});

describe("matchSpan", () => {
  it("finds the match ignoring case + diacritics", () => {
    expect(matchSpan("Sønder Boulevard 18", "sonder")).toEqual([0, 6]);
  });

  it("returns null if not found", () => {
    expect(matchSpan("Sønder Boulevard 18", "kongens nytorv")).toBeNull();
  });

  it("returns null for empty query", () => {
    expect(matchSpan("Any address", "")).toBeNull();
  });
});
