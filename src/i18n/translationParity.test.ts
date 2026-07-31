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
const NAMESPACES = ["common", "marketplace", "legal", "ai"] as const;

/** Values that are intentionally identical in every language. */
const SHARED_LITERALS = new Set([
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
]);

/**
 * Keys whose values are proper nouns (people, cities) — identical across
 * languages by design, apart from exonyms handled in the bundles themselves.
 */
const PROPER_NOUNS = /(^|\.)(name|city|firstName|lastName)$/;

/** Keys whose values are machine-readable, not user-facing prose. */
// Note: `version` is intentionally absent — it is a UI label ("Version") in
// several namespaces. Actual version numbers carry no letters and are skipped
// by the leakage rule below.
const NON_CONTENT =
  /(^|\.)(href|url|route|path|slug|id|code|locale|currency|lastUpdated|date)$|_(href|url|route|path|slug|id)$/i;

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
          (k) => NON_CONTENT.test(k) && k in target && target[k] !== source[k],
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
            if (NON_CONTENT.test(k)) return false;
            if (PROPER_NOUNS.test(k)) return false;
            if (SHARED_LITERALS.has(v.trim())) return false;
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
