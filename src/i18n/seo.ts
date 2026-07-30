// Localised SEO helpers. Emits canonical, hreflang, x-default and og tags for
// country-aware routes. Inactive/development/suspended countries are never
// indexed. Private routes emit noindex.
import { SUPPORTED_COUNTRIES, type CountryISO, type CountryPublic } from "./CountryContext";
import type { SupportedLanguage } from "./index";

export const BASE_URL = "https://mycleaner.dk";

const LANG_BY_COUNTRY: Record<CountryISO, SupportedLanguage[]> = {
  DK: ["da", "en"],
  GB: ["en"],
  SE: ["sv", "en"],
  ES: ["es", "en"],
};

export function bcp47(lang: SupportedLanguage, iso: CountryISO): string {
  return `${lang}-${iso}`;
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
  tag: "title" | "meta" | "link";
  attrs: Record<string, string>;
  text?: string;
}

/** Build SEO tag set. Returns [] for private routes except a noindex meta. */
export function buildSeoTags(input: {
  path: string;
  activeCountries: CountryPublic[];
  currentIso: CountryISO | null;
  currentLang: SupportedLanguage;
  title: string;
  description: string;
}): SeoTag[] {
  const { path, activeCountries, currentIso, currentLang, title, description } = input;

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

  // Only emit canonical/hreflang for countries in an indexable lifecycle state.
  const indexable = activeCountries; // caller already filtered to active
  const iso = currentIso && indexable.find(c => c.iso === currentIso) ? currentIso : null;

  if (iso) {
    const canonical = `${BASE_URL}/${iso.toLowerCase()}${rest === "/" ? "" : rest}`;
    tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical } });
    tags.push({ tag: "meta", attrs: { property: "og:url", content: canonical } });
    tags.push({ tag: "meta", attrs: { property: "og:locale", content: bcp47(currentLang, iso) } });

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
  } else {
    // Unknown/none — do NOT emit misleading canonical.
    tags.push({ tag: "meta", attrs: { name: "robots", content: "noindex" } });
  }

  return tags;
}
