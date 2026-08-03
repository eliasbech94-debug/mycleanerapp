/**
 * Company configuration + verified-data contract.
 *
 * Guards the rule that only officially verified legal entity data may be
 * rendered. Unverified numbers (CVR, VAT, phone) must never appear in the
 * config or in the shipped locale bundles.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COMPANY, PENDING_VERIFICATION, formatCompanyAddress, supportEmailFor } from "./company";

const LANGS = ["da", "en", "sv", "de", "es"] as const;

describe("company config", () => {
  it("exposes the verified Companies House identity", () => {
    expect(COMPANY.legalName).toBe("MYCLEANER INTERNATIONAL LTD");
    expect(COMPANY.companyNumber).toBe("16401689");
    expect(COMPANY.registryUrl).toContain("company-information.service.gov.uk/company/16401689");
  });

  it("formats the verified registered office", () => {
    expect(formatCompanyAddress()).toBe(
      "1 Coldbath Square, London, England, EC1R 5HL, United Kingdom",
    );
  });

  it("uses the single verified support mailbox for every market", () => {
    for (const m of ["DK", "SE", "GB", "DE", "ES", "gb", "unknown", null]) {
      expect(supportEmailFor(m)).toBe("support@mycleaner.dk");
    }
  });

  it("never carries unverified registration or phone numbers", () => {
    const serialised = JSON.stringify(COMPANY);
    expect(serialised).not.toMatch(/\bCVR\b/i);
    expect(serialised).not.toMatch(/\bVAT\b/i);
    expect(serialised).not.toMatch(/\+\d{6,}/); // no phone numbers
  });

  it("documents what still requires official verification", () => {
    expect(PENDING_VERIFICATION.length).toBeGreaterThan(0);
  });
});

describe("locale bundles never invent company identifiers", () => {
  for (const lang of LANGS) {
    it(`${lang}/common.json has no invented CVR/VAT/phone values`, () => {
      const raw = readFileSync(`public/locales/${lang}/common.json`, "utf8");
      expect(raw).not.toMatch(/CVR[-\s:]*\d/i);
      expect(raw).not.toMatch(/VAT[-\s:]*(no|nr|number)?[-\s:]*[A-Z]{0,2}\d{6,}/i);
      expect(raw).not.toMatch(/\+\d{2}[\s\d]{6,}/);
    });

    it(`${lang}/common.json references the verified company number only via interpolation`, () => {
      const bundle = JSON.parse(readFileSync(`public/locales/${lang}/common.json`, "utf8"));
      expect(bundle.footer.companyNumber).toContain("{{number}}");
      expect(bundle.footer.companyNumber).not.toContain("16401689");
    });
  }
});
