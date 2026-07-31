// Guards that the edge-runtime copy of the cancellation policy never drifts
// from the frontend copy. Only the file header (above the first export) may
// differ — the executable body must be identical.
//
// Also guards the coordinated 18/8 activation: one activation instant, one
// selector (`policyAt`), a server-only kill switch, and public pages that
// derive their copy from the policy instead of hardcoding hour thresholds.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANCELLATION_POLICY_V2_ACTIVATION_AT,
  policyAt,
} from "./cancellationPolicy";
import {
  cancellationLadderBullets,
  cancellationLadderSentence,
} from "./cancellationPolicyCopy";

const ROOT = resolve(__dirname, "../..");
const FRONTEND = "src/lib/cancellationPolicy.ts";
const EDGE = "supabase/functions/_shared/cancellationPolicy.ts";

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function body(path: string): string {
  const src = read(path);
  const start = src.indexOf("export type CancellationTierKey");
  expect(start).toBeGreaterThan(-1);
  return src.slice(start).trim();
}

describe("cancellation policy parity", () => {
  it("frontend and edge copies share an identical body", () => {
    expect(body(EDGE)).toBe(body(FRONTEND));
  });

  it("both copies declare the same activation instant, byte for byte", () => {
    const line = `export const CANCELLATION_POLICY_V2_ACTIVATION_AT = "2026-08-03T06:00:00.000Z";`;
    expect(read(FRONTEND)).toContain(line);
    expect(read(EDGE)).toContain(line);
    expect(CANCELLATION_POLICY_V2_ACTIVATION_AT).toBe("2026-08-03T06:00:00.000Z");
  });

  it("both copies publish exactly the same policy versions", () => {
    const versions = (src: string) => src.match(/version: "\d+\.\d+\.\d+"/g);
    expect(versions(body(EDGE))).toEqual(versions(body(FRONTEND)));
    expect(versions(body(FRONTEND))).toEqual(['version: "1.0.0"', 'version: "2.0.0"']);
  });

  it("the kill switch is server-side only and requires an explicit opt-in", () => {
    expect(read(EDGE)).toContain('Deno?.env.get("CANCELLATION_POLICY_V2_ENABLED")?.trim().toLowerCase() === "true"');
    // The frontend copy must never read a client-controllable source.
    expect(read(FRONTEND)).not.toContain("localStorage");
    expect(read(FRONTEND)).not.toContain("import.meta.env");
    expect(read(FRONTEND)).toContain("const CANCELLATION_POLICY_V2_ENABLED_DEFAULT = true;");
  });

  it("policy selection fails safe to v1 when the switch is off", () => {
    expect(policyAt(Date.parse(CANCELLATION_POLICY_V2_ACTIVATION_AT), false).version).toBe("1.0.0");
  });

  it("new bookings snapshot the policy resolved from server time", () => {
    const fn = read("supabase/functions/payment-create-intent/index.ts");
    expect(fn).toContain("const acceptedCancellationSnapshot = cancellationPolicySnapshot(policyAt(new Date()))");
    expect(fn).toContain("cancellation_policy_snapshot: acceptedCancellationSnapshot");
    // The accepted version travels back to the client so the confirmation
    // screen quotes the frozen terms, not today's policy.
    expect(fn).toContain("cancellation_policy_version");
  });

  it("the booking confirmation renders the frozen policy version", () => {
    const flow = read("src/pages/BookingFlow.tsx");
    expect(flow).toContain("setAcceptedPolicyVersion(data.cancellation_policy_version ?? null)");
    expect(flow).toContain("policyVersion={policyVersion}");
  });

  it("booking-cancel imports the shared policy instead of inlining thresholds", () => {
    const fn = read("supabase/functions/booking-cancel/index.ts");
    expect(fn).toContain('from "../_shared/cancellationPolicy.ts"');
    expect(fn).not.toMatch(/hoursUntilService\s*>=\s*48/);
  });

  it("booking-cancel resolves the exact start instant from slot + timezone", () => {
    const fn = read("supabase/functions/booking-cancel/index.ts");
    expect(fn).toContain("bookingStartInstant(booking.booking_date, booking.slot, booking.timezone)");
    expect(fn).not.toContain("T00:00:00Z");
  });

  it("booking-cancel uses the frozen snapshot and never re-selects by cancel time", () => {
    const fn = read("supabase/functions/booking-cancel/index.ts");
    expect(fn).toContain("policyForSnapshot(acceptedSnapshot)");
    expect(fn).toContain("refundPercentForHours(hoursUntilService, policy)");
    expect(fn).not.toContain("policyAt(");
  });

  it("public rule pages derive the ladder instead of hardcoding hours", () => {
    const regler = read("src/pages/Regler.tsx");
    expect(regler).toContain("cancellationLadderBullets()");
    expect(regler).not.toMatch(/Mere end 18 timer/);
    expect(regler).not.toMatch(/48 timer eller mere/);
    const faq = read("src/pages/FAQ.tsx");
    expect(faq).toContain("cancellationLadderSentence()");
    expect(faq).not.toMatch(/Fra og med 8 og til og med 18 timer/);
  });

  it("derived copy matches whichever ladder is in force", () => {
    const v1 = policyAt("2026-08-03T05:59:59.999Z", true);
    const v2 = policyAt("2026-08-03T06:00:00.000Z", true);
    expect(cancellationLadderBullets(v1)[0]).toContain("48 timer eller mere");
    expect(cancellationLadderBullets(v1)[2]).toContain("Under 24 timer");
    expect(cancellationLadderBullets(v2)[0]).toContain("Mere end 18 timer");
    expect(cancellationLadderBullets(v2)[1]).toContain("Fra og med 8 timer til og med 18 timer");
    expect(cancellationLadderBullets(v2)[2]).toContain("Under 8 timer");
    expect(cancellationLadderSentence(v2)).toContain("100 % cancellation fee");
  });

  it("never promises a 100% refund for a late cancellation", () => {
    const notice = read("src/components/booking/CancellationPolicyNotice.tsx");
    expect(notice).toContain("0 % refusion — 100 % cancellation fee");
    expect(notice).not.toMatch(/Fuld refundering/);
    // The notice shows the booking's frozen version, or the policy in force now.
    expect(notice).toContain("policyForVersion(policyVersion)");
    expect(notice).toContain("policyAt(new Date())");
  });
});
