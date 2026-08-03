import { describe, expect, it } from "vitest";
import { extractHeadings, headingId, readingTimeMinutes } from "@/lib/legal/markdown";
import { fallbackTiers } from "@/lib/legal/api";

describe("legal markdown helpers", () => {
  it("slugifies danish characters", () => {
    expect(headingId("Ansvar og Nøgler Å")).toBe("ansvar-og-noegler-aa");
  });

  it("extracts H2-H4 and skips code fences", () => {
    const md = "# Titel\n\n## Et\n\n```\n## Ikke en overskrift\n```\n\n### To\n\n#### Tre\n\n##### For dyb";
    expect(extractHeadings(md).map((h) => [h.level, h.text])).toEqual([
      [2, "Et"],
      [3, "To"],
      [4, "Tre"],
    ]);
  });

  it("returns at least one reading minute", () => {
    expect(readingTimeMinutes("kort tekst")).toBe(1);
    expect(readingTimeMinutes(Array(400).fill("ord").join(" "))).toBe(2);
  });
});

describe("legal fallback tiers", () => {
  it("resolves country+lang → country+en → GLOBAL+en", () => {
    expect(fallbackTiers("DK", "da")).toEqual([
      { country: "DK", language: "da" },
      { country: "DK", language: "en" },
      { country: "GLOBAL", language: "en" },
    ]);
  });

  it("skips duplicate english tier", () => {
    expect(fallbackTiers("GB", "en")).toEqual([
      { country: "GB", language: "en" },
      { country: "GLOBAL", language: "en" },
    ]);
  });
});
