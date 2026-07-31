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

  it("booking-cancel resolves the exact start instant from slot + timezone", () => {
    const fn = readFileSync(resolve(ROOT, "supabase/functions/booking-cancel/index.ts"), "utf8");
    expect(fn).toContain("bookingStartInstant(booking.booking_date, booking.slot, booking.timezone)");
    expect(fn).not.toContain('T00:00:00Z');
  });

  it("booking-cancel evaluates the policy version frozen on the booking", () => {
    const fn = readFileSync(resolve(ROOT, "supabase/functions/booking-cancel/index.ts"), "utf8");
    expect(fn).toContain("policyForSnapshot(acceptedSnapshot)");
    expect(fn).toContain("refundPercentForHours(hoursUntilService, policy)");
  });

  it("new bookings freeze the accepted cancellation policy", () => {
    const fn = readFileSync(resolve(ROOT, "supabase/functions/payment-create-intent/index.ts"), "utf8");
    expect(fn).toContain("cancellation_policy_snapshot: cancellationPolicySnapshot()");
  });

  it("public rule pages quote the canonical 18/8 ladder", () => {
    const regler = readFileSync(resolve(ROOT, "src/pages/Regler.tsx"), "utf8");
    expect(regler).toContain("Mere end 18 timer");
    expect(regler).toContain("Fra og med 8 timer til og med 18 timer");
    expect(regler).toContain("0 % refusion");
    expect(regler).not.toMatch(/48 timer eller mere/);
    const faq = readFileSync(resolve(ROOT, "src/pages/FAQ.tsx"), "utf8");
    expect(faq).toContain("100 % cancellation fee");
  });

  it("never promises a 100% refund for a late cancellation", () => {
    const notice = readFileSync(resolve(ROOT, "src/components/booking/CancellationPolicyNotice.tsx"), "utf8");
    expect(notice).toContain("0 % refusion — 100 % cancellation fee");
    expect(notice).not.toMatch(/Fuld refundering/);
  });
});
