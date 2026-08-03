// Regression: Career Identity public surfaces MUST NOT expose sensitive
// internal fields. This is a static test — it parses the generated Supabase
// types file and inspects the shape of every Career Identity view whose name
// starts with `public_`. If a forbidden column reappears in a public view's
// Row shape, this test fails immediately.
//
// It also scans the frontend for any client-side `select()` string that would
// pull forbidden columns from `cleaner_career_profiles` in an unauthenticated
// context (e.g. an anon-facing helper).
//
// Staging RLS validation, storage isolation, and signed-URL expiry are covered
// separately by the staging security sign-off harness — see
// docs/rc/career-identity-phase-2-signoff.md.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const FORBIDDEN_COLUMNS = [
  "user_id",
  "evidence_storage_path",
  "storage_path",
  "review_notes",
  "reviewer_notes",
  "verified_by",
  "reviewed_by",
  "rejection_reason",
  "signed_url",
  "signedUrl",
] as const;

const ROOT = resolve(__dirname, "..", "..", "..");
const TYPES_PATH = join(ROOT, "src", "integrations", "supabase", "types.ts");

function extractViewRow(types: string, viewName: string): string | null {
  const start = types.indexOf(`${viewName}: {`);
  if (start === -1) return null;
  const rowIdx = types.indexOf("Row: {", start);
  if (rowIdx === -1) return null;
  // Naive balanced-brace scan — sufficient for a generated file.
  let depth = 0;
  for (let i = rowIdx; i < types.length; i++) {
    const ch = types[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return types.slice(rowIdx, i + 1);
    }
  }
  return null;
}

describe("Career Identity — public data leak regression", () => {
  const types = readFileSync(TYPES_PATH, "utf8");

  it("public_cleaner_career_profiles view exists in generated types", () => {
    expect(types).toContain("public_cleaner_career_profiles:");
  });

  it("public_cleaner_career_profiles view exposes no forbidden columns", () => {
    const rowBlock = extractViewRow(types, "public_cleaner_career_profiles");
    expect(rowBlock, "view Row block not found in types.ts").not.toBeNull();
    const leaked = FORBIDDEN_COLUMNS.filter((col) =>
      // Match "col: ..." at property position, not inside longer identifiers
      new RegExp(`(^|[\\s,{])${col}\\s*:`).test(rowBlock!),
    );
    expect(leaked, `public view leaks: ${leaked.join(", ")}`).toEqual([]);
  });

  it("no career-*_public or career_public_* view leaks forbidden columns", () => {
    // Match any view whose name starts with `public_` AND references career/cleaner
    const viewNamePattern =
      /(public_(?:career|cleaner)_[a-z_]+):\s*\{\s*Row:/g;
    let match: RegExpExecArray | null;
    const failures: string[] = [];
    while ((match = viewNamePattern.exec(types)) !== null) {
      const name = match[1];
      const rowBlock = extractViewRow(types, name);
      if (!rowBlock) continue;
      const leaked = FORBIDDEN_COLUMNS.filter((col) =>
        new RegExp(`(^|[\\s,{])${col}\\s*:`).test(rowBlock),
      );
      if (leaked.length) failures.push(`${name} → ${leaked.join(", ")}`);
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  });

  it("client code never selects reviewer/audit columns from career profiles", () => {
    // Static grep across src/ for any `.from("cleaner_career_profiles")` or
    // `.from("public_cleaner_career_profiles")` chain whose select string
    // includes a forbidden column. Server-side edge functions are allowed to
    // read these; only src/ is scanned.
    const offences: string[] = [];
    const forbiddenInPublicClient = new Set([
      "review_notes",
      "reviewer_notes",
      "verified_by",
      "reviewed_by",
      "rejection_reason",
      "evidence_storage_path",
    ]);
    const srcDir = join(ROOT, "src");

    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) {
          if (name === "node_modules" || name === "dist" || name === "integrations")
            continue;
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        if (/\.test\.tsx?$/.test(name)) continue;
        const src = readFileSync(p, "utf8");
        const re = /\.from\(\s*["'`](public_cleaner_career_profiles|cleaner_career_profiles)["'`]\s*\)([\s\S]{0,400}?)\.select\(\s*["'`]([^"'`]+)["'`]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const cols = m[3].split(",").map((c) => c.trim().split(/[\s(]/)[0]);
          const bad = cols.filter((c) => forbiddenInPublicClient.has(c));
          if (bad.length) offences.push(`${p}: ${bad.join(",")}`);
        }
      }
    }
    walk(srcDir);
    expect(offences, offences.join(" | ")).toEqual([]);
  });
});
