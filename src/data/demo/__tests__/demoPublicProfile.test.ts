import { describe, expect, it } from "vitest";
import { DEMO_PROVIDER_FIXTURES } from "@/data/demo/providers";
import {
  toDemoPublicReviews,
  toDemoSlots,
  toDemoWorkHistory,
  toPublicProviderProfile,
} from "@/data/demo/publicProfile";

describe("demo public provider profile adapter", () => {
  it("maps every fixture to a complete public profile", () => {
    for (const p of DEMO_PROVIDER_FIXTURES) {
      const profile = toPublicProviderProfile(p);
      expect(profile.provider_slug).toBe(p.provider_slug);
      expect(profile.display_name.length).toBeGreaterThan(0);
      expect(profile.services?.length ?? 0).toBeGreaterThan(0);
      expect(profile.services?.every((s) => s.amount_minor > 0 && s.currency.length === 3)).toBe(true);
      expect(toDemoWorkHistory(p).length).toBeGreaterThan(0);
    }
  });

  it("produces bookable slots unless the scenario is fully booked", () => {
    const p = DEMO_PROVIDER_FIXTURES[0];
    expect(toDemoSlots(p).length).toBeGreaterThan(0);
    expect(toDemoSlots(p, true)).toEqual([]);
  });

  it("returns public-safe reviews (first name only)", () => {
    const p = DEMO_PROVIDER_FIXTURES[0];
    for (const r of toDemoPublicReviews(p.provider_slug, 5)) {
      expect(r.reviewer_first_name ?? "").not.toContain(" ");
      expect(r.rating).toBeGreaterThan(0);
    }
  });
});
