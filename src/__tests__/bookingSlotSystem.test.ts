import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Contract guards for the availability + slot-locking system. These protect the
 * server-authoritative path: no booking may be created or accepted without the
 * database re-validating the requested interval.
 */
const paymentIntent = readFileSync(
  "supabase/functions/payment-create-intent/index.ts",
  "utf8",
);
const decide = readFileSync("supabase/functions/booking-decide/index.ts", "utf8");

describe("booking slot system contracts", () => {
  it("re-validates the requested slot server-side before creating a booking", () => {
    expect(paymentIntent).toContain("validate_booking_slot_request_v1");
    const validateIdx = paymentIntent.indexOf("validate_booking_slot_request_v1");
    const insertIdx = paymentIntent.indexOf('.from("bookings")\n      .insert(');
    expect(validateIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(validateIdx);
  });

  it("binds the checkout lock to the created booking", () => {
    expect(paymentIntent).toContain("bind_booking_slot_lock_v1");
  });

  it("never trusts client-supplied availability results", () => {
    expect(paymentIntent).not.toMatch(/body\.(is_available|slot_ok)/);
  });

  it("re-checks the calendar before capturing payment on accept", () => {
    const guardIdx = decide.indexOf("booking_accept_slot_guard_v1");
    const captureIdx = decide.indexOf("/capture");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(guardIdx);
  });

  it("releases the slot lock when a provider declines", () => {
    expect(decide).toContain("booking_release_slot_locks_v1");
  });
});
