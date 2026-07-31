/**
 * Launch Market Safety Patch — public copy must not promise five live markets.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isDemoModeEnabled, isProductionHost, isPreviewHost, PRODUCTION_HOSTS } from "@/data/demo";

const LANGS = ["da", "en", "sv", "de", "es"] as const;

function marketplace(lng: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), `public/locales/${lng}/marketplace.json`), "utf8"),
  );
}
function common(lng: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), `public/locales/${lng}/common.json`), "utf8"),
  );
}

describe("hero availability copy", () => {
  it.each(LANGS)("%s no longer claims MyCleaner is available in all five markets", (lng) => {
    const hero = marketplace(lng).hero;
    const txt = `${hero.availability} ${hero.availability_label}`;
    expect(txt).not.toMatch(/Tilgængelig i 🇩🇰/);
    expect(txt).not.toMatch(/Available in 🇩🇰/);
    expect(txt).not.toMatch(/Disponible en 🇩🇰/);
    expect(txt).not.toMatch(/Tillgänglig i 🇩🇰/);
  });

  it("Danish hero states Denmark first, others coming soon", () => {
    expect(marketplace("da").hero.launch_notice).toBe(
      "MyCleaner åbner først i Danmark. Sverige, Storbritannien, Tyskland og Spanien følger snart.",
    );
  });

  it("English hero states Denmark first, others coming soon", () => {
    expect(marketplace("en").hero.launch_notice).toBe(
      "MyCleaner is launching first in Denmark. Sweden, the United Kingdom, Germany and Spain are coming soon.",
    );
  });

  it.each(LANGS)("%s has a coming-soon badge label", (lng) => {
    expect(marketplace(lng).hero.coming_soon).toBeTruthy();
    expect(common(lng).country.coming_soon).toBeTruthy();
  });
});

describe("production never shows demo content", () => {
  it.each(PRODUCTION_HOSTS)("%s is a production host", (h) => {
    expect(isProductionHost(h)).toBe(true);
    expect(isPreviewHost(h)).toBe(false);
  });

  it("preview hosts may still show demo content", () => {
    expect(isPreviewHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isPreviewHost("localhost")).toBe(true);
  });

  it("demo mode is off when the runtime hostname is production", () => {
    const original = window.location.hostname;
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname: "mycleaner.dk" },
      writable: true,
    });
    expect(isDemoModeEnabled()).toBe(false);
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname: original },
      writable: true,
    });
  });
});
