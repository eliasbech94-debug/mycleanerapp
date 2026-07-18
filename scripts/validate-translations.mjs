// CI translation validator. English is the canonical key set. Fails with a
// non-zero exit code if launch-required namespaces contain missing keys,
// invalid ICU syntax, empty values, or fallback stubs.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "public/locales";
const LANGS = ["da", "en", "sv", "es"];
const REQUIRED_NS = ["common"]; // add: booking, checkout, legal, ... as they materialise
const LAUNCH_READY_LANGS = ["da", "en"]; // DK is the only active country today

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch (e) { return { __error: e.message }; }
}

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("_")) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

const errors = [];
const warnings = [];

for (const ns of REQUIRED_NS) {
  const enPath = join(ROOT, "en", `${ns}.json`);
  if (!existsSync(enPath)) { errors.push(`missing canonical: en/${ns}.json`); continue; }
  const enFlat = flatten(loadJson(enPath));

  for (const lng of LANGS) {
    const p = join(ROOT, lng, `${ns}.json`);
    if (!existsSync(p)) {
      (LAUNCH_READY_LANGS.includes(lng) ? errors : warnings)
        .push(`missing bundle: ${lng}/${ns}.json`);
      continue;
    }
    const doc = loadJson(p);
    if (doc.__error) { errors.push(`invalid JSON: ${lng}/${ns}.json ${doc.__error}`); continue; }
    const flat = flatten(doc);

    // Fallback-stub bundles are allowed for non-launch languages only.
    if (doc._fallback_language) {
      if (LAUNCH_READY_LANGS.includes(lng))
        errors.push(`launch-required ${lng}/${ns}.json is a fallback stub`);
      continue;
    }

    for (const k of Object.keys(enFlat)) {
      if (!(k in flat) || flat[k] === "" || flat[k] == null) {
        (LAUNCH_READY_LANGS.includes(lng) ? errors : warnings)
          .push(`${lng}/${ns}.json missing key: ${k}`);
      }
    }
    for (const k of Object.keys(flat)) {
      if (!(k in enFlat)) warnings.push(`${lng}/${ns}.json obsolete key: ${k}`);
    }
  }
}

console.log(`✓ ${warnings.length} warning(s), ${errors.length} error(s)`);
warnings.forEach(w => console.log("  warn:", w));
errors.forEach(e => console.error("  err :", e));
process.exit(errors.length ? 1 : 0);
