#!/usr/bin/env node
/**
 * i18n hardcoded-string audit.
 *
 * Scans src/ for user-facing literals that are NOT routed through i18n:
 *   - JSX text nodes
 *   - user-facing string attributes (placeholder, title, aria-label, label,
 *     alt, description, emptyText…)
 *   - toast()/sonner title+description object literals
 *
 * Deliberately ignored (per audit scope): code identifiers, enum values, ids,
 * API/database values, slugs, class names, URLs, test files, and anything
 * already inside t(...) / defaultValue.
 *
 * Usage: node scripts/i18n-audit.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const SKIP_DIR = /(__tests__|node_modules|integrations\/supabase)/;
const SKIP_FILE = /\.(test|spec|contract\.test)\.(t|j)sx?$/;
/** Files whose strings are internal-only (admin tooling, dev/demo fixtures). */
const INTERNAL = [/\/pages\/admin\//, /\/data\/demo\//, /\/components\/demo\//, /\/dev\//];

const ATTRS = [
  "placeholder", "title", "aria-label", "alt", "label", "description",
  "emptyText", "tooltip", "helperText", "confirmLabel", "cancelLabel",
];

// A literal is user-facing when it reads like a sentence/phrase for humans.
const WORDY = /^[A-ZÆØÅÄÖÜa-zæøåäöüßáéíóúñ][\p{L}\p{N} ,.\-–—:;!?'"%&()/+]{3,}$/u;
const IDENTIFIER = /^[a-z0-9_.\-/]+$/i;              // slugs, keys, api values
const URLISH = /^(https?:|mailto:|tel:|\/|#|data:)/;
const CLASSY = /(^|\s)(flex|grid|text-|bg-|w-|h-|p-|m-|rounded|border|gap-|hsl\()/;
// Code fragments accidentally caught by the ">...<" JSX-text pattern
// (e.g. `setBelow(window.innerWidth < 1024)`), plus proper nouns/endonyms that
// must stay identical in every language.
const CODEISH = /[(){};=]|=>|\b(window|document|const|return|props)\b/;
const ALLOWED_LITERALS = new Set([
  "Dansk", "English", "Svenska", "Deutsch", "Español",
  "MyCleaner", "Stripe", "Stripe Connect", "Google", "Sumsub",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.test(full)) walk(full, out);
    } else if (/\.tsx$/.test(entry) && !SKIP_FILE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isUserFacing(text) {
  const s = text.trim();
  if (s.length < 4) return false;
  if (ALLOWED_LITERALS.has(s)) return false;
  if (!/\p{L}\p{L}/u.test(s)) return false;
  if (URLISH.test(s) || CLASSY.test(s)) return false;
  if (IDENTIFIER.test(s) && !/\s/.test(s)) return false;
  if (/^[A-Z0-9_]+$/.test(s)) return false;           // CONSTANT_CASE
  return WORDY.test(s);
}

const findings = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    // Already localized on this line.
    const localized = /\bt\(|defaultValue|useTranslation|i18nKey/.test(line);

    const record = (kind, text) => {
      if (!isUserFacing(text)) return;
      findings.push({
        file: rel,
        line: i + 1,
        kind,
        text: text.trim().slice(0, 120),
        scope: INTERNAL.some((r) => r.test("/" + rel)) ? "internal" : "public",
      });
    };

    // JSX text nodes: >Some text<
    for (const m of line.matchAll(/>\s*([^<>{}\n]{4,})\s*</g)) {
      if (localized) continue;
      const raw = m[1].trim();
      if (CODEISH.test(raw) || ALLOWED_LITERALS.has(raw)) continue;
      record("jsx-text", raw);
    }
    // User-facing attributes with literal values
    for (const attr of ATTRS) {
      const re = new RegExp(`${attr}=(?:"([^"]{4,})"|'([^']{4,})'|\\{\\s*"([^"]{4,})"\\s*\\})`, "g");
      for (const m of line.matchAll(re)) record(`attr:${attr}`, m[1] ?? m[2] ?? m[3]);
    }
    // Toast payloads
    for (const m of line.matchAll(/\b(title|description|message)\s*:\s*"([^"]{4,})"/g)) {
      if (localized) continue;
      record("object-literal", m[2]);
    }
  });
}

const publicFindings = findings.filter((f) => f.scope === "public");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: findings.length, public: publicFindings.length, findings }, null, 2));
} else {
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`Hardcoded user-facing strings: ${findings.length} total (${publicFindings.length} on public/customer surfaces) in ${byFile.size} files\n`);
  for (const [file, items] of sorted) {
    console.log(`${file}  (${items.length}) [${items[0].scope}]`);
    for (const it of items.slice(0, 12)) console.log(`   ${it.line}: [${it.kind}] ${it.text}`);
    if (items.length > 12) console.log(`   … ${items.length - 12} more`);
  }
}
