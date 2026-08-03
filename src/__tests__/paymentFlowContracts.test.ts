// Regression guards for the booking/payment flow audit.
//
// 1. Edge functions must only write enum values that actually exist in the
//    database (`payment_status`, `booking_status`). A typo here silently
//    breaks every checkout at runtime (P0 found in the audit: "unpaid").
// 2. Stripe's `payment_intent.requires_action` must never mark a booking as
//    authorized, and replayed/out-of-order events must not roll a booking back
//    out of a terminal money state.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FN_DIR = "supabase/functions";

const PAYMENT_STATUS = [
  "none", "authorized", "captured", "canceled",
  "failed", "expired", "refunded", "partially_refunded",
];
const BOOKING_STATUS = ["pending", "accepted", "declined", "cancelled", "completed"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const sources = walk(FN_DIR).map((f) => ({ file: f, code: readFileSync(f, "utf8") }));

describe("edge functions write valid booking enums", () => {
  it("only assigns known payment_status values", () => {
    const bad: string[] = [];
    for (const { file, code } of sources) {
      for (const m of code.matchAll(/payment_status:\s*"([a-z_]+)"/g)) {
        if (!PAYMENT_STATUS.includes(m[1])) bad.push(`${file}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("only assigns known booking status values", () => {
    const bad: string[] = [];
    for (const { file, code } of sources) {
      for (const m of code.matchAll(/\bstatus:\s*"(pending|accepted|declined|cancelled|canceled|completed|complete|unpaid)"/g)) {
        if (!BOOKING_STATUS.includes(m[1])) bad.push(`${file}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("stripe-webhook status transitions", () => {
  const code = readFileSync(join(FN_DIR, "stripe-webhook/index.ts"), "utf8");

  it("does not authorize on requires_action", () => {
    // Routing now lives in _shared/stripeEventRouting.ts.
    const routing = readFileSync(join(FN_DIR, "_shared/stripeEventRouting.ts"), "utf8");
    const block = routing.slice(routing.indexOf("requires_action"), routing.indexOf("requires_action") + 120);
    expect(block).not.toMatch(/authorized/);
  });

  it("guards terminal money states against downgrades", () => {
    expect(code).toMatch(/canApplyPaymentState/);
    expect(code).toMatch(/TERMINAL_PAYMENT_STATES/);
    expect(code).toMatch(/refunded/);
  });

});

describe("payment-mark-authorized", () => {
  const code = readFileSync(join(FN_DIR, "payment-mark-authorized/index.ts"), "utf8");
  it("never downgrades to a default status on unknown Stripe states", () => {
    expect(code).not.toMatch(/map\[pi\.status\]\s*\|\|\s*"none"/);
    expect(code).toMatch(/TERMINAL/);
  });
});
