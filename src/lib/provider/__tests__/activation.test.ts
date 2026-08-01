import { describe, it, expect } from "vitest";
import { deriveProviderActivation } from "@/lib/provider/activation";

const approved = {
  status: "active",
  identity_status: "approved",
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  completion_pct: 100,
};

describe("deriveProviderActivation", () => {
  it("marks an active provider active with no onboarding steps", () => {
    const a = deriveProviderActivation(approved);
    expect(a.active).toBe(true);
    expect(a.state).toBe("active");
    expect(a.nextSteps).toHaveLength(0);
  });

  it("is fail-closed for a missing profile", () => {
    const a = deriveProviderActivation(null);
    expect(a.active).toBe(false);
    expect(a.state).toBe("no_profile");
  });

  it("maps each non-active status to a restricted state", () => {
    const cases: Array<[string, string]> = [
      ["pending_identity", "missing_identity"],
      ["pending_stripe", "missing_stripe"],
      ["pending_review", "pending_review"],
      ["paused", "paused"],
      ["suspended", "suspended"],
      ["rejected", "rejected"],
      ["archived", "archived"],
      ["draft", "missing_profile_details"],
    ];
    for (const [status, state] of cases) {
      const a = deriveProviderActivation({ ...approved, status, completion_pct: 60 });
      expect(a.active).toBe(false);
      expect(a.state).toBe(state);
    }
  });

  it("never treats an unknown status as active", () => {
    const a = deriveProviderActivation({ ...approved, status: "some_new_status" });
    expect(a.active).toBe(false);
  });

  it("always offers a support route for blocked providers", () => {
    for (const status of ["suspended", "rejected", "archived", "pending_review"]) {
      const a = deriveProviderActivation({ ...approved, status });
      expect(a.nextSteps.some((s) => s.id === "support")).toBe(true);
    }
  });

  it("suggests identity and payout steps when they are incomplete", () => {
    const a = deriveProviderActivation({
      status: "draft",
      identity_status: "pending",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      completion_pct: 40,
    });
    expect(a.nextSteps.map((s) => s.id)).toEqual(["profile", "identity", "stripe", "support"]);
  });
});
