// Guards that the edge-runtime copy of the cancellation policy never drifts
// from the frontend copy. Only the file header (above the first export) may
// differ — the executable body must be identical.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function body(path: string): string {
  const src = readFileSync(resolve(ROOT, path), "utf8");
  const start = src.indexOf("export type CancellationTierKey");
  expect(start).toBeGreaterThan(-1);
  return src.slice(start).trim();
}

describe("cancellation policy parity", () => {
  it("frontend and edge copies share an identical body", () => {
    expect(body("supabase/functions/_shared/cancellationPolicy.ts")).toBe(
      body("src/lib/cancellationPolicy.ts"),
    );
  });

  it("booking-cancel imports the shared policy instead of inlining thresholds", () => {
    const fn = readFileSync(resolve(ROOT, "supabase/functions/booking-cancel/index.ts"), "utf8");
    expect(fn).toContain('from "../_shared/cancellationPolicy.ts"');
    expect(fn).not.toMatch(/hoursUntilService\s*>=\s*48/);
  });
});
