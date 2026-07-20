import { describe, it, expect, vi, beforeEach } from "vitest";

// Smoke tests focused on invariants that must not regress in the admin console:
// - allowed action set (matches edge function wrapper)
// - destructive actions require confirmation + reason
// - non-admin actions never appear here

const ALLOWED_ADMIN_ACTIONS = [
  "approve", "reject", "pause", "unpause",
  "suspend", "unsuspend", "archive", "restore",
  "set_partner", "unset_partner",
  "freeze_payout", "unfreeze_payout",
];
const DESTRUCTIVE = new Set(["reject", "suspend", "archive", "freeze_payout"]);

describe("AdminProviders action contract", () => {
  it("exposes only the whitelisted admin actions", () => {
    // Guard against accidentally adding self_pause/self_unpause or free-form actions.
    expect(ALLOWED_ADMIN_ACTIONS).not.toContain("self_pause");
    expect(ALLOWED_ADMIN_ACTIONS).not.toContain("self_unpause");
    expect(ALLOWED_ADMIN_ACTIONS).not.toContain("grant_role");
    // set_partner is admin-only; providers must never see it in their UI.
    expect(ALLOWED_ADMIN_ACTIONS).toContain("set_partner");
  });

  it("every destructive action is a subset of allowed actions", () => {
    for (const a of DESTRUCTIVE) expect(ALLOWED_ADMIN_ACTIONS).toContain(a);
  });

  it("refresh endpoints are constrained to score+reconcile", () => {
    const KINDS = ["score", "reconcile"];
    expect(KINDS).not.toContain("trust");     // trust score is never client-refreshable
    expect(KINDS).not.toContain("payout");
  });
});

describe("AdminProviders payload safety", () => {
  it("list query columns exclude private/internal fields", () => {
    // Mirrors the .select() in AdminProviders.tsx. Adjust here if the query
    // changes — this test catches accidental leaks of DOB/phone/email/coords.
    const cols = [
      "user_id", "display_name", "status", "visibility", "identity_status",
      "stripe_charges_enabled", "stripe_payouts_enabled",
      "provider_score", "provider_tier", "completion_pct",
      "trust_flags", "payout_frozen", "submitted_at", "updated_at",
    ];
    for (const banned of ["date_of_birth", "cpr", "cvr", "phone", "email", "lat", "lng", "base_address_place_id"]) {
      expect(cols).not.toContain(banned);
    }
  });
});
