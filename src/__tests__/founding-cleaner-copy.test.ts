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
        expect(fc.ctaPrimaryNote).toBeTruthy();
        expect(fc.ctaSecondary).toBeTruthy();
        expect(fc.startNote).toBeTruthy();
        expect(fc.plannedBenefit).toBeTruthy();
        expect(fc.status).toBeTruthy();
        expect(fc.status.title).toBeTruthy();
        expect(fc.status.body).toBeTruthy();
        expect(Array.isArray(fc.how.steps)).toBe(true);
        expect(fc.how.steps.length).toBe(3);
        expect(Array.isArray(fc.terms.items)).toBe(true);
        expect(fc.terms.items.length).toBeGreaterThanOrEqual(10);
        expect(fc.terms.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("mentions 2026 eligibility window in campaign body, intro and terms", () => {
        expect(String(dict.campaign.body)).toMatch(/2026/);
        expect(String(dict.foundingCleaner.intro)).toMatch(/2026/);
        const termsBlob = (dict.foundingCleaner.terms.items as string[]).join("\n");
        expect(termsBlob).toMatch(/2026/);
        // Global 500-seat cap must appear in the terms body
        expect(termsBlob).toMatch(/500/);
      });

      it("campaign body mentions 0 platform fee framing scoped to the PROVIDER fee", () => {
        const body = String(dict.campaign.body).toLowerCase();
        expect(body).toMatch(/0/);
        expect(body).toMatch(/plattform|platform|plataforma/);
        // Fee scope must be the provider's platform fee, not a combined/all fees claim
        expect(body).toMatch(/provider|leverantör|proveedor/);
      });

      it("communicates 'opens soon' status and 'does not reserve a spot' safety copy", () => {
        const openSoon: Record<string, RegExp> = {
          da: /åbner snart/i,
          en: /opens soon/i,
          sv: /öppnar snart/i,
          es: /abre pronto/i,
        };
        const noReserve: Record<string, RegExp> = {
          da: /reserverer ikke/i,
          en: /does not (?:automatically )?reserve/i,
          sv: /reserverar (?:inte|ingen)/i,
          es: /no reserva/i,
        };
        expect(String(dict.campaign.title)).toMatch(openSoon[lang]);
        expect(String(dict.foundingCleaner.status.title)).toMatch(openSoon[lang]);
        expect(String(dict.campaign.note)).toMatch(noReserve[lang]);
        expect(String(dict.foundingCleaner.status.body)).toMatch(noReserve[lang]);
      });

      it("uses three calendar months wording, not 90 days", () => {
        const blob2 = JSON.stringify(dict.foundingCleaner).toLowerCase();
        const calMonths: Record<string, RegExp> = {
          da: /tre kalendermåneder/i,
          en: /three calendar months/i,
          sv: /tre kalendermånader/i,
          es: /tres meses naturales/i,
        };
        expect(blob2).toMatch(calMonths[lang]);
      });
    });
  }
});
