// Localised SEO helpers. Emits canonical, hreflang, x-default and og tags for
// country-aware routes.
//
// Indexing rules (Launch Market Safety):
//  - Only BOOKABLE markets are indexable. A market that is merely
//    launch_ready/coming soon must never rank on a page that promises
//    booking, so it emits `noindex` and no canonical/hreflang.
//  - Private routes always emit noindex, nofollow.
//  - hreflang alternates are emitted only between indexable markets.
import { SUPPORTED_COUNTRIES, type CountryISO, type CountryPublic } from "./CountryContext";
import type { SupportedLanguage } from "./index";

export const BASE_URL = "https://mycleaner.dk";

export const LANG_BY_COUNTRY: Record<CountryISO, SupportedLanguage[]> = {
  DK: ["da", "en"],
  GB: ["en"],
  SE: ["sv", "en"],
  DE: ["de", "en"],
  ES: ["es", "en"],
};

/** Open Graph wants `da_DK`, hreflang wants `da-DK`. */
export function bcp47(lang: SupportedLanguage, iso: CountryISO): string {
  return `${lang}-${iso}`;
}

export function ogLocale(lang: SupportedLanguage, iso: CountryISO): string {
  return `${lang}_${iso}`;
}

export function isPrivateRoute(path: string): boolean {
  return /^\/(admin|provider-dashboard|provider\/(finance|disputes|bilag)|mine-bookinger|book\/|booking\/|auth\/|privatliv|profil|task\/)/.test(path);
}

export function stripCountryPrefix(path: string): { iso: CountryISO | null; rest: string } {
  const m = path.match(/^\/([a-z]{2})(\/.*|$)/i);
  if (m && (SUPPORTED_COUNTRIES as readonly string[]).includes(m[1].toUpperCase())) {
    return { iso: m[1].toUpperCase() as CountryISO, rest: m[2] || "/" };
  }
  return { iso: null, rest: path };
}

export interface SeoTag {
  tag: "title" | "meta" | "link" | "script";
  attrs: Record<string, string>;
  text?: string;
}

/** Build SEO tag set. Returns a noindex set for private/closed-market routes. */
export function buildSeoTags(input: {
  path: string;
  /** Countries eligible for indexing — callers pass only BOOKABLE markets. */
  activeCountries: CountryPublic[];
  currentIso: CountryISO | null;
  currentLang: SupportedLanguage;
  title: string;
  description: string;
  /** Optional JSON-LD payload for the route. */
  jsonLd?: Record<string, unknown> | null;
}): SeoTag[] {
  const { path, activeCountries, currentIso, currentLang, title, description, jsonLd } = input;

  if (isPrivateRoute(path)) {
    return [
      { tag: "meta", attrs: { name: "robots", content: "noindex, nofollow" } },
      { tag: "title", attrs: {}, text: title },
    ];
  }

  const { rest } = stripCountryPrefix(path);
  const tags: SeoTag[] = [
    { tag: "title", attrs: {}, text: title },
    { tag: "meta", attrs: { name: "description", content: description } },
    { tag: "meta", attrs: { property: "og:title", content: title } },
    { tag: "meta", attrs: { property: "og:description", content: description } },
    { tag: "meta", attrs: { property: "og:type", content: "website" } },
  ];

  const indexable = activeCountries; // caller already filtered to bookable
  const iso = currentIso && indexable.find(c => c.iso === currentIso) ? currentIso : null;

  if (iso) {
    const canonical = `${BASE_URL}/${iso.toLowerCase()}${rest === "/" ? "" : rest}`;
    tags.push({ tag: "meta", attrs: { name: "robots", content: "index, follow" } });
    tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical } });
    tags.push({ tag: "meta", attrs: { property: "og:url", content: canonical } });
    tags.push({ tag: "meta", attrs: { property: "og:locale", content: ogLocale(currentLang, iso) } });

    for (const c of indexable) {
      for (const l of LANG_BY_COUNTRY[c.iso] ?? [c.default_language as SupportedLanguage]) {
        tags.push({
          tag: "link",
          attrs: {
            rel: "alternate",
            hreflang: bcp47(l, c.iso),
            href: `${BASE_URL}/${c.iso.toLowerCase()}${rest === "/" ? "" : rest}`,
          },
        });
      }
    }
    tags.push({
      tag: "link",
      attrs: { rel: "alternate", hreflang: "x-default", href: `${BASE_URL}${rest}` },
    });

    if (jsonLd) {
      tags.push({ tag: "script", attrs: { type: "application/ld+json" }, text: JSON.stringify(jsonLd) });
    }
  } else {
    // Closed / unknown market: never index a page that implies bookability,
    // and never emit a misleading canonical.
    tags.push({ tag: "meta", attrs: { name: "robots", content: "noindex, follow" } });
  }

  return tags;
}
