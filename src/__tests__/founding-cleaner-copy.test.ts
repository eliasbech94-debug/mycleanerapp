/**
 * Founding Cleaner campaign copy — locale guards.
 *
 * Ensures:
 *  - No forbidden phrases appear in campaign/foundingCleaner copy across all
 *    supported locales (livstid, lifetime, vitalicio, 12 måneder/months/meses,
 *    "gratis i 3 måneder", "ingen gebyrer", "no fees", "keep 100 %", etc.).
 *  - CTA target is the informational page, not direct onboarding.
 *  - Required keys exist in every locale.
 */
import { describe, it, expect } from "vitest";
import da from "../../public/locales/da/marketplace.json";
import en from "../../public/locales/en/marketplace.json";
import sv from "../../public/locales/sv/marketplace.json";
import es from "../../public/locales/es/marketplace.json";

const LOCALES = { da, en, sv, es } as const;

const FORBIDDEN = [
  "livstid",     // da/sv
  "lifetime",    // en
  "vitalicio",   // es
  "12 måneder",
  "12 månader",
  "12 months",
  "12 meses",
  "gratis i 3 måneder",
  "free for 3 months",
  "gratis durante 3 meses",
  "ingen gebyrer",
  "no fees",
  "sin comisiones",
  "beholder 100",
  "behåller 100",
  "keep 100",
  "quedas con el 100",
];

describe("Founding Cleaner — locale guards", () => {
  for (const [lang, dict] of Object.entries(LOCALES)) {
    describe(lang, () => {
      const blob = JSON.stringify(dict).toLowerCase();

      it("contains no forbidden phrases", () => {
        const hits = FORBIDDEN.filter((p) => blob.includes(p.toLowerCase()));
        expect(hits, `Forbidden phrases found in ${lang}: ${hits.join(", ")}`).toEqual([]);
      });

      it("campaign block points at /founding-cleaner", () => {
  
        expect(dict.campaign.href).toBe("/founding-cleaner");
  
        expect(String(dict.campaign.eyebrow)).toMatch(/FOUNDING CLEANER/);
      });

      it("has required foundingCleaner keys", () => {
  
        const fc = dict.foundingCleaner;
        expect(fc).toBeTruthy();
        expect(fc.heading).toBeTruthy();
        expect(fc.intro).toBeTruthy();
        expect(fc.ctaPrimary).toBeTruthy();
        expect(fc.ctaSecondary).toBeTruthy();
        expect(fc.startNote).toBeTruthy();
        expect(Array.isArray(fc.how.steps)).toBe(true);
        expect(fc.how.steps.length).toBe(3);
        expect(Array.isArray(fc.terms.items)).toBe(true);
        expect(fc.terms.items.length).toBeGreaterThanOrEqual(10);
        expect(fc.terms.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("campaign body mentions 0 platform fee framing", () => {
  
        const body = String(dict.campaign.body).toLowerCase();
        // Every locale references "0" and either "platform" or "plattform" wording.
        expect(body).toMatch(/0/);
        expect(body).toMatch(/plattform|platform/);
      });
    });
  }
});
