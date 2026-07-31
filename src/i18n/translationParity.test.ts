/**
 * Translation parity guard.
 *
 * Fails when a language bundle is missing keys the Danish source has, when a
 * non-English bundle silently reuses the English string (machine/fallback
 * leakage), or when a bundle carries orphan keys.
 *
 * Scope note: keys listed in SHARED_LITERALS are legitimately identical
 * across languages (brand names, language endonyms, protected terms).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = "da";
const TARGETS = ["en", "sv", "de", "es"] as const;
const NAMESPACES = ["common", "marketplace", "legal", "ai"] as const;

/** Values that are intentionally identical in every language. */
const SHARED_LITERALS = new Set([
  "MyCleaner",
  // Brand-locked product/label names — identical by design in every language.
  "MyCleaner Support",
  "Dansk",
  "English",
  "Svenska",
  "Español",
  "Deutsch",
  "Legal Center",
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
]);

function load(lang: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`public/locales/${lang}/${ns}.json`, "utf8"));
}

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
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

  // English-fallback leakage: sv/de/es strings identical to the English one.
  for (const ns of NAMESPACES) {
    const en = flatten(load("en", ns));
    for (const lang of ["sv", "de", "es"] as const) {
      it(`${lang}/${ns}.json contains no untranslated English fallbacks`, () => {
        const target = flatten(load(lang, ns));
        const leaked = Object.entries(target)
          .filter(([k, v]) => {
            if (!(k in en)) return false;
            if (SHARED_LITERALS.has(v.trim())) return false;
            // Single tokens shorter than 5 chars are too noisy to judge.
            if (v.trim().length < 5) return false;
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
