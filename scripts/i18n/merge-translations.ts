/**
 * Merge translated bundles into public/locales/<lang>/<ns>.json.
 *
 * Input files are flat maps of dotted key -> translated string.
 * Rules enforced here (i18n architecture invariants):
 *   - Never write a key that does not exist in the English source bundle.
 *     English is the source language; a translation may not invent content.
 *   - Never translate non-content values: routes/hrefs/urls, ids, slugs,
 *     enum-like tokens. Those are copied from English verbatim.
 *   - Never overwrite an existing translation that already differs from
 *     English (a human/earlier pass already handled it).
 *
 * Usage: bunx tsx scripts/i18n/merge-translations.ts <dir>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = process.argv[2] ?? "/tmp/i18n/out";
const LOCALES = resolve("public/locales");

/** Keys whose values are machine-readable, never user-facing prose. */
const NON_CONTENT = /(^|\.)(href|url|route|path|slug|id|code|locale|currency)$|_(href|url|route|path|slug|id)$/i;

type Flat = Record<string, string>;

function flatten(obj: unknown, prefix = "", out: Flat = {}): Flat {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    // Arrays are flattened by index too — bundles use arrays for list copy.
    if (v && typeof v === "object") flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = /^\d+$/.test(p) ? [] : {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts.at(-1)!] = value;
}

const load = (lang: string, ns: string) =>
  JSON.parse(readFileSync(join(LOCALES, lang, `${ns}.json`), "utf8")) as Record<string, unknown>;

/** lang -> ns -> { key: value } */
const pending: Record<string, Record<string, Flat>> = {};
const add = (lang: string, ns: string, key: string, value: string) => {
  ((pending[lang] ??= {})[ns] ??= {})[key] = value;
};

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as Flat;
  const m = file.match(/^[A-Z0-9]+_([a-z]{2})_([a-z]+)\.json$/);
  for (const [rawKey, value] of Object.entries(data)) {
    if (typeof value !== "string") continue;
    if (m) {
      add(m[1], m[2], rawKey, value);
    } else {
      // Fully-qualified form: "<lang>/<ns>.<dotted.key>"
      const q = rawKey.match(/^([a-z]{2})\/([a-z]+)\.(.+)$/);
      if (q) add(q[1], q[2], q[3], value);
    }
  }
}

let written = 0;
let skippedNonContent = 0;
let skippedUnknown = 0;
let skippedExisting = 0;

for (const [lang, namespaces] of Object.entries(pending)) {
  for (const [ns, entries] of Object.entries(namespaces)) {
    const en = flatten(load("en", ns));
    const targetDoc = load(lang, ns);
    const target = flatten(targetDoc);

    for (const [key, value] of Object.entries(entries)) {
      if (!(key in en)) { skippedUnknown++; continue; }
      if (NON_CONTENT.test(key)) {
        if (target[key] !== en[key]) { setDeep(targetDoc, key, en[key]); written++; }
        else skippedNonContent++;
        continue;
      }
      // Already translated by someone else — do not clobber.
      if (key in target && target[key].trim() && target[key].trim() !== en[key].trim()) {
        skippedExisting++;
        continue;
      }
      if (value.trim() === "") continue;
      setDeep(targetDoc, key, value);
      written++;
    }

    writeFileSync(join(LOCALES, lang, `${ns}.json`), JSON.stringify(targetDoc, null, 2) + "\n");
    console.log(`${lang}/${ns}: merged`);
  }
}

console.log(
  `done — written=${written} skipped(existing)=${skippedExisting} ` +
    `skipped(non-content)=${skippedNonContent} skipped(unknown key)=${skippedUnknown}`,
);
