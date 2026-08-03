import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The alpha-2 -> alpha-3 map lives in a Deno-only edge module, so it is parsed
// out of the source here rather than imported. This keeps a single source of
// truth: if the edge map changes, these assertions run against the new data.
const iso3Src = readFileSync("supabase/functions/_shared/iso3.ts", "utf8");
const sumsubSrc = readFileSync("supabase/functions/_shared/sumsub.ts", "utf8");

function parseMap(): Record<string, string> {
  const body = iso3Src.slice(
    iso3Src.indexOf("Object.freeze({") + "Object.freeze({".length,
    iso3Src.indexOf("});"),
  );
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/([A-Z]{2}):"([A-Z]{3})"/g)) out[m[1]] = m[2];
  return out;
}

const MAP = parseMap();

/** Mirror of toAlpha3 in supabase/functions/_shared/iso3.ts. */
function toAlpha3(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  if (key.length === 3) return Object.values(MAP).includes(key) ? key : null;
  return MAP[key] ?? null;
}

describe("ISO alpha-2 -> alpha-3 conversion for Sumsub", () => {
  it("contains the full official ISO 3166-1 set", () => {
    expect(Object.keys(MAP)).toHaveLength(249);
  });

  // Sumsub rejects alpha-2 outright ("Country 'DK' is not valid. Use alpha-3
  // code."), which previously broke applicant creation for every launch market.
  it.each([
    ["DK", "DNK"],
    ["SE", "SWE"],
    ["DE", "DEU"],
    ["GB", "GBR"],
    ["ES", "ESP"],
  ])("maps launch market %s to %s", (a2, a3) => {
    expect(toAlpha3(a2)).toBe(a3);
  });

  it("normalises casing and surrounding whitespace", () => {
    expect(toAlpha3(" dk ")).toBe("DNK");
  });

  it("passes through a valid alpha-3 unchanged (idempotent)", () => {
    expect(toAlpha3("DNK")).toBe("DNK");
    expect(toAlpha3(toAlpha3("DK"))).toBe("DNK");
  });

  it("returns null for unknown, invalid or blank input so the field is omitted", () => {
    for (const bad of ["", "  ", "ZZ", "XXX", "D", null, undefined]) {
      expect(toAlpha3(bad)).toBeNull();
    }
  });

  it("never produces a value that is not a real alpha-3 code", () => {
    const valid = new Set(Object.values(MAP));
    for (const a2 of Object.keys(MAP)) expect(valid.has(toAlpha3(a2)!)).toBe(true);
  });
});

describe("createApplicant country handling", () => {
  it("converts to alpha-3 instead of upper-casing the alpha-2 code", () => {
    expect(sumsubSrc).toContain("toAlpha3(args.countryCode)");
    // The original defect: sending the raw alpha-2 code straight through.
    expect(sumsubSrc).not.toContain("country: args.countryCode.toUpperCase()");
  });

  it("omits the country rather than sending an unmappable value", () => {
    expect(sumsubSrc).toContain("sumsub_country_unmappable");
    const idx = sumsubSrc.indexOf("const alpha3 = toAlpha3(args.countryCode)");
    expect(sumsubSrc.slice(idx, idx + 200)).toContain("if (alpha3) body.info");
  });
});

describe("e2e diagnostic safety", () => {
  const e2eSrc = readFileSync("supabase/functions/identity-e2e-verify/index.ts", "utf8");

  it("is admin-only and refuses to run on a production configuration", () => {
    expect(e2eSrc).toContain('requireRole(ctx, ["admin"]');
    expect(e2eSrc).toContain("refused_in_production");
    expect(e2eSrc).toContain("envDecision.isProduction");
  });

  it("writes to no MyCleaner tables", () => {
    expect(e2eSrc).not.toMatch(/\.from\(["'][a-z_]+["']\)/);
  });
});
