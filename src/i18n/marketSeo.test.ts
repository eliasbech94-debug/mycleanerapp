/**
 * Market SEO contract.
 *
 * Guards the launch-safety rule: a market that is not bookable must never be
 * indexed on a page that promises booking, and must never receive a canonical
 * or hreflang alternate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildSeoTags, LANG_BY_COUNTRY, bcp47, ogLocale, BASE_URL } from "./seo";
import { SUPPORTED_COUNTRIES, type CountryPublic } from "./CountryContext";

function country(iso: string, lang: string, currency: string): CountryPublic {
  return {
    iso: iso as CountryPublic["iso"],
    active: true,
    launch_status: "active",
    default_language: lang as CountryPublic["default_language"],
    supported_languages: [lang as CountryPublic["default_language"]],
    currency,
    timezone: "Europe/Copenhagen",
    booking_public: {},
    payment_methods_public: [],
    contact_public: {},
    feature_availability_public: {},
    legal_references_public: [],
  };
}

const DK = country("DK", "da", "DKK");
const bookableOnly = [DK]; // server reports only DK as bookable

const tagsFor = (path: string, iso: CountryPublic["iso"] | null, lang = "da") =>
  buildSeoTags({
    path,
    activeCountries: bookableOnly,
    currentIso: iso,
    currentLang: lang as never,
    title: "T",
    description: "D",
  });

const robots = (tags: ReturnType<typeof tagsFor>) =>
  tags.find((t) => t.attrs.name === "robots")?.attrs.content ?? null;

describe("all five launch markets are known to the routing/SEO layer", () => {
  it("supports DK, SE, GB, DE and ES", () => {
    expect([...SUPPORTED_COUNTRIES].sort()).toEqual(["DE", "DK", "ES", "GB", "SE"]);
  });

  it("declares languages for every supported market", () => {
    for (const iso of SUPPORTED_COUNTRIES) {
      expect(LANG_BY_COUNTRY[iso]?.length, iso).toBeGreaterThan(0);
    }
  });

  it("uses hyphen for hreflang and underscore for og:locale", () => {
    expect(bcp47("de", "DE")).toBe("de-DE");
    expect(ogLocale("de", "DE")).toBe("de_DE");
  });
});

describe("bookable market (DK)", () => {
  const tags = tagsFor("/dk/faq", "DK");

  it("is indexable with a self-referencing canonical", () => {
    expect(robots(tags)).toBe("index, follow");
    expect(tags.find((t) => t.attrs.rel === "canonical")?.attrs.href).toBe(
      `${BASE_URL}/dk/faq`,
    );
  });

  it("points og:url at the page itself", () => {
    expect(tags.find((t) => t.attrs.property === "og:url")?.attrs.content).toBe(
      `${BASE_URL}/dk/faq`,
    );
  });

  it("emits og:locale in Open Graph form", () => {
    expect(tags.find((t) => t.attrs.property === "og:locale")?.attrs.content).toBe("da_DK");
  });

  it("emits hreflang only for bookable markets plus x-default", () => {
    const hreflangs = tags
      .filter((t) => t.attrs.rel === "alternate")
      .map((t) => t.attrs.hreflang)
      .sort();
    expect(hreflangs).toEqual(["da-DK", "en-DK", "x-default"]);
  });

  it("carries JSON-LD when supplied", () => {
    const withLd = buildSeoTags({
      path: "/dk",
      activeCountries: bookableOnly,
      currentIso: "DK",
      currentLang: "da",
      title: "T",
      description: "D",
      jsonLd: { "@type": "Organization" },
    });
    const ld = withLd.find((t) => t.tag === "script");
    expect(ld?.attrs.type).toBe("application/ld+json");
    expect(JSON.parse(ld!.text!)["@type"]).toBe("Organization");
  });
});

describe("closed markets are never indexed as bookable", () => {
  for (const iso of ["SE", "GB", "DE", "ES"] as const) {
    it(`${iso} emits noindex and no canonical`, () => {
      const tags = tagsFor(`/${iso.toLowerCase()}/faq`, iso);
      expect(robots(tags)).toContain("noindex");
      expect(tags.find((t) => t.attrs.rel === "canonical")).toBeUndefined();
      expect(tags.find((t) => t.attrs.rel === "alternate")).toBeUndefined();
    });

    it(`${iso} never appears as an hreflang alternate on a DK page`, () => {
      const tags = tagsFor("/dk/faq", "DK");
      const hrefs = tags.filter((t) => t.attrs.rel === "alternate").map((t) => t.attrs.href);
      expect(hrefs.some((h) => h.includes(`/${iso.toLowerCase()}`))).toBe(false);
    });
  }

  it("an unknown market is noindex, never a silent DK canonical", () => {
    const tags = tagsFor("/faq", null);
    expect(robots(tags)).toContain("noindex");
    expect(tags.find((t) => t.attrs.rel === "canonical")).toBeUndefined();
  });
});

describe("private routes", () => {
  for (const path of ["/admin/countries", "/book/abc", "/mine-bookinger", "/profil"]) {
    it(`${path} is noindex, nofollow`, () => {
      expect(robots(tagsFor(path, "DK"))).toBe("noindex, nofollow");
    });
  }
});

describe("sitemap", () => {
  const xml = readFileSync("public/sitemap.xml", "utf8");

  it("lists only the bookable market", () => {
    expect(xml).toContain("https://mycleaner.dk/dk");
    for (const iso of ["se", "gb", "de", "es"]) {
      expect(xml).not.toContain(`mycleaner.dk/${iso}`);
    }
  });

  it("advertises the production domain", () => {
    expect(xml).not.toContain("lovable.app");
  });

  it("carries no build-date lastmod", () => {
    expect(xml).not.toContain("<lastmod>");
  });

  it("excludes private routes", () => {
    for (const p of ["/admin", "/book/", "/mine-bookinger", "/profil"]) {
      expect(xml).not.toContain(`${p}<`);
    }
  });
});

describe("robots.txt", () => {
  const txt = readFileSync("public/robots.txt", "utf8");

  it("does not block the whole site", () => {
    expect(txt).not.toMatch(/^\s*Disallow:\s*\/\s*$/m);
  });

  it("keeps private areas out of the index", () => {
    for (const p of ["/admin", "/book/", "/mine-bookinger", "/profil", "/auth/"]) {
      expect(txt).toContain(`Disallow: ${p}`);
    }
  });

  it("points at the production sitemap", () => {
    expect(txt).toContain("Sitemap: https://mycleaner.dk/sitemap.xml");
  });
});
