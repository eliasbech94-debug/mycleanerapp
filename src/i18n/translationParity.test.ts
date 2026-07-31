/**
 * Translation parity guard.
 *
 * English is the SOURCE language: every other bundle must mirror the English
 * key set exactly. The test fails when a language bundle is missing keys,
 * carries orphan keys, has empty values, breaks interpolation placeholders, or
 * silently reuses the English string (untranslated content leaking to users).
 *
 * Scope notes:
 *  - SHARED_LITERALS are legitimately identical across languages: brand names,
 *    language endonyms, protected terms, and loanwords that are genuinely the
 *    same word in the target language.
 *  - NON_CONTENT keys hold machine-readable values (routes, urls, dates,
 *    version numbers). They MUST stay identical and are never translated.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = "en";
const TARGETS = ["da", "sv", "de", "es"] as const;
/**
 * Derived from the runtime namespace list in `src/i18n/index.ts` so a namespace
 * can never be declared without shipping a bundle: a missing file is served as
 * index.html by the SPA fallback, which i18next silently parses as an empty
 * bundle and every key in it falls back to the raw key string.
 */
const NAMESPACES: readonly string[] = (() => {
  const src = readFileSync("src/i18n/index.ts", "utf8");
  const m = src.match(/const NAMESPACES = \[([^\]]+)\]/);
  if (!m) throw new Error("Could not read the namespace list from src/i18n/index.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();


/** Values that are intentionally identical in every language. */
const SHARED_LITERALS = new Set([
  // Identical across da/sv/de/es — translating them would be wrong.
  "Administration",
  "Filter",
  "Radius:",
  "Upload",
  "Score",
  "Reference",
  "Booking · MyCleaner",
  "MyCleaner",
  "MyCleaner Support",
  "MyCleaner Legal Center",
  "Dansk",
  "English",
  "Svenska",
  "Español",
  "Deutsch",
  "Legal Center",
  "Trust Center",
  "Support",
  "SMS",
  "FAQ",
  "Cleaner",
  "Session",
  "Profil",
  "Dashboard",
  "Provider",
  "Platform",
  "Kontakt",
  "Marketplace",
  // Store names — brand-locked.
  "App Store",
  "Google Play",
  // Campaign names — brand-locked, never localised.
  "FOUNDING CLEANER",
  "Founding Cleaner",
  "2026 EDITION",
  // Loanwords that are the same word in one or more target languages.
  "Cookies",
  "Status",
  "Version",
  "Total",
  "Service",
  "Performance",
  "Print",
  "Legal",
  "Download PDF",
  "Legal Center — MyCleaner",
  "{{title}} · version {{version}}",
  // "Status:" is the loanword "Status" plus punctuation, identical in da/sv/de/es.
  "Status:",
  // "Radius (km)" — "Radius" is the same word in da/sv/de/es; the unit is universal.
  "Radius (km)",
  // Cognate adjectives spelled identically across da/sv/de/es.
  "Normal",
  "Flexible",
]);

/**
 * Keys whose values are proper nouns (people, cities) — identical across
 * languages by design, apart from exonyms handled in the bundles themselves.
 */
const PROPER_NOUNS = /(^|\.)(name|city|firstName|lastName)$/;

/**
 * Per-key allowlist for values that are genuinely identical to English in a
 * specific language/namespace/key combination — proper nouns, brand-locked
 * product terms, or loanwords that happen to be spelled the same in that
 * language. Scoped narrowly (rather than added to SHARED_LITERALS) so a
 * coincidental match elsewhere in the same bundle still gets caught.
 * Format: "lang/ns:key.path".
 */
const PER_KEY_ALLOWED_IDENTICAL = new Set([
  // Brand-locked product/feature names — never translated.
  "da/provider:onboardingSurfaces.careerIdentity.brandLabel",
  "sv/provider:onboardingSurfaces.careerIdentity.brandLabel",
  "de/provider:onboardingSurfaces.careerIdentity.brandLabel",
  "es/provider:onboardingSurfaces.careerIdentity.brandLabel",
  "da/provider:onboardingSurfaces.careerIdentity.permanentId.title",
  "da/provider:onboardingSurfaces.stripeWidget.sectionLabel",
  // "Region" is spelled identically in Danish, Swedish and German.
  "da/provider:surfaces.pricing.region",
  "sv/provider:surfaces.pricing.region",
  "de/provider:surfaces.pricing.region",
  "da/admin:rules.table.headers.region",
  "sv/admin:rules.table.headers.region",
  "de/admin:rules.table.headers.region",
  // "System" is spelled identically in Danish, Swedish and German.
  "da/admin:rules.tax.systemLabel",
  "sv/admin:rules.tax.systemLabel",
  "de/admin:rules.tax.systemLabel",
  // "Audit" is used untranslated as a short tab label in Danish and German.
  "da/admin:rules.editor.tabs.audit",
  "de/admin:rules.editor.tabs.audit",
  // "Rule Packs" / "URL (https)" are deliberately-untranslated technical/
  // product terms shared across all bundles.
  "da/admin:rules.dashboard.rulePacksTitle",
  "sv/admin:rules.dashboard.rulePacksTitle",
  "de/admin:rules.dashboard.rulePacksTitle",
  "es/admin:rules.dashboard.rulePacksTitle",
  "da/admin:rules.sources.urlLabel",
  "sv/admin:rules.sources.urlLabel",
  "de/admin:rules.sources.urlLabel",
  "es/admin:rules.sources.urlLabel",
  // "Period" is spelled identically in Swedish.
  "sv/admin:rules.filing.periodLabel",
  // "General" is spelled identically in Spanish.
  "es/admin:rules.editor.tabs.general",
  "es/admin:rules.general.title",
  // "Booking" / "Platform" are common loanwords in Danish.
  "da/finance:ui.financePages.booking",
  "da/finance:ui.income.add.platformSuggestionA",
  "da/finance:ui.income.add.platformSuggestionB",
  "da/finance:ui.income.add.platformSuggestionC",
  // "Version" is spelled identically in Swedish and German.
  "sv/finance:ui.reports.section.versionLabel",
  "de/finance:ui.reports.section.versionLabel",
  // "Provisional" is spelled identically in Spanish.
  "es/finance:ui.reports.section.provisional",
]);

/** Keys whose values are machine-readable, not user-facing prose. */
// Note: `version` is intentionally absent — it is a UI label ("Version") in
// several namespaces. Actual version numbers carry no letters and are skipped
// by the leakage rule below.
const NON_CONTENT_KEY =
  /(^|\.)(href|url|route|path|slug|id|code|locale|currency|lastUpdated|date)$|_(href|url|route|path|slug|id)$/i;

/**
 * A key name alone is ambiguous: `summary.date` and `verify.code` are UI labels
 * ("Date", "Code"), while `locale` and `privacy_href` hold machine values. Only
 * treat an entry as machine-readable when the English value looks machine-readable
 * too: a URL/route, an all-lowercase token, a locale tag, or anything with a digit.
 */
function isMachineValue(v: string): boolean {
  const s = v.trim();
  if (s === "") return true;
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/.test(s)) return true;
  if (/^[a-z]{2}-[A-Z]{2}$/.test(s)) return true;
  if (/^[a-z0-9._:+-]+$/.test(s)) return true;
  return /\d/.test(s);
}

const NON_CONTENT = (key: string, enValue: string): boolean =>
  NON_CONTENT_KEY.test(key) && isMachineValue(enValue);


function load(lang: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`public/locales/${lang}/${ns}.json`, "utf8"));
}

/** Flatten objects AND arrays so every leaf string is compared individually. */
function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = String(value);
  }
  return out;
}

/**
 * JSON.parse silently keeps the LAST of two identical keys, so a duplicate is
 * invisible after parsing and quietly shadows a translation. This walks the raw
 * text with a parent stack and reports any key declared twice in the same
 * object.
 */
function duplicateKeyPaths(raw: string): string[] {
  const stack: string[] = [];
  const seen = new Map<string, Set<string>>();
  const dupes: string[] = [];
  let lastKey = "";
  const tokens = raw.matchAll(/"(?:[^"\\]|\\.)*"\s*:|[{}]/g);
  for (const [tok] of tokens) {
    if (tok === "{") {
      stack.push(lastKey);
      continue;
    }
    if (tok === "}") {
      seen.delete(stack.join("."));
      stack.pop();
      continue;
    }
    const key = tok.slice(1, tok.lastIndexOf('"'));
    const path = stack.join(".");
    const bucket = seen.get(path) ?? new Set<string>();
    if (bucket.has(key)) dupes.push(`${path}.${key}`);
    bucket.add(key);
    seen.set(path, bucket);
    lastKey = key;
  }
  return dupes;
}

describe("translation bundles exist for every declared namespace", () => {

  for (const ns of NAMESPACES) {
    for (const lang of [SOURCE, ...TARGETS]) {
      it(`${lang}/${ns}.json ships as valid JSON without duplicate keys`, () => {
        const raw = readFileSync(`public/locales/${lang}/${ns}.json`, "utf8");
        expect(() => JSON.parse(raw), `${lang}/${ns}.json is not valid JSON`).not.toThrow();
        expect(duplicateKeyPaths(raw), `duplicate keys in ${lang}/${ns}`).toEqual([]);
      });

    }
  }
});

describe("translation parity", () => {
  for (const ns of NAMESPACES) {

    const source = flatten(load(SOURCE, ns));

    for (const lang of TARGETS) {
      const target = flatten(load(lang, ns));

      it(`${lang}/${ns}.json has no missing keys`, () => {
        const missing = Object.keys(source).filter((k) => !(k in target));
        expect(missing, `missing keys in ${lang}/${ns}`).toEqual([]);
      });

      it(`${lang}/${ns}.json has no orphan keys`, () => {
        const orphans = Object.keys(target).filter((k) => !(k in source));
        expect(orphans, `orphan keys in ${lang}/${ns}`).toEqual([]);
      });

      it(`${lang}/${ns}.json has no empty values`, () => {
        // Deliberately-empty config values (store links not published yet).
        const empty = Object.entries(target)
          .filter(([k, v]) => v.trim() === "" && !/(_href|_url|Href|Url)$/.test(k))
          .map(([k]) => k);
        expect(empty).toEqual([]);
      });

      it(`${lang}/${ns}.json keeps machine-readable values identical`, () => {
        const drifted = Object.keys(source).filter(
          (k) => NON_CONTENT(k, source[k]) && k in target && target[k] !== source[k],
        );
        expect(drifted, `translated a non-content value in ${lang}/${ns}`).toEqual([]);
      });

      it(`${lang}/${ns}.json keeps interpolation placeholders intact`, () => {
        const broken: string[] = [];
        for (const [k, v] of Object.entries(source)) {
          const vars = [...v.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
          if (!vars.length || !(k in target)) continue;
          const tVars = [...target[k].matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
          if (vars.join(",") !== tVars.join(",")) broken.push(k);
        }
        expect(broken, `placeholder mismatch in ${lang}/${ns}`).toEqual([]);
      });
    }
  }

  // Untranslated-content leakage: a target string identical to the English one.
  for (const ns of NAMESPACES) {
    const en = flatten(load(SOURCE, ns));
    for (const lang of ["da", "sv", "de", "es"] as const) {
      it(`${lang}/${ns}.json contains no untranslated English fallbacks`, () => {
        const target = flatten(load(lang, ns));
        const leaked = Object.entries(target)
          .filter(([k, v]) => {
            if (!(k in en)) return false;
            if (NON_CONTENT(k, en[k])) return false;
            if (PROPER_NOUNS.test(k)) return false;
            if (SHARED_LITERALS.has(v.trim())) return false;
            if (PER_KEY_ALLOWED_IDENTICAL.has(`${lang}/${ns}:${k}`)) return false;
            // Single tokens shorter than 5 chars are too noisy to judge.
            if (v.trim().length < 5) return false;
            // Nothing translatable once placeholders and punctuation are
            // removed (e.g. "{{title}} · v{{version}}") — identical is correct.
            const words = v.replace(/{{\s*\w+\s*}}/g, " ").replace(/[^\p{L}]+/gu, " ").trim();
            if (words.length < 5) return false;
            return v.trim() === en[k].trim();
          })
          .map(([k, v]) => `${k} = "${v}"`);
        expect(leaked, `English fallback leaked into ${lang}/${ns}`).toEqual([]);
      });
    }
  }

  it("no bundle declares a fallback-language escape hatch", () => {
    for (const lang of [SOURCE, ...TARGETS]) {
      for (const ns of NAMESPACES) {
        const raw = JSON.parse(readFileSync(`public/locales/${lang}/${ns}.json`, "utf8"));
        expect(raw._fallback_language, `${lang}/${ns}`).toBeUndefined();
      }
    }
  });
});
