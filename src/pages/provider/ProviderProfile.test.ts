import { describe, it, expect } from "vitest";
import { OWNER_EDITABLE_COLUMNS } from "@/hooks/useProviderProfileEditor";

// Lifecycle / trust columns that MUST never be included in the owner-editable
// whitelist consumed by the native V2 provider profile editor. Enforced in
// tandem with the `provider_profiles_block_privileged_update` DB trigger.
const PROTECTED_COLUMNS = [
  "status",
  "approved_at", "approved_by",
  "rejected_at", "rejected_by", "rejection_reason",
  "suspended_at", "suspended_by", "suspension_reason",
  "activated_at", "activated_by",
  "archived_at", "archived_by",
  "submitted_at",
] as const;

describe("Provider profile owner-safe column whitelist (V2)", () => {
  it("does not allow editing lifecycle fields", () => {
    for (const col of PROTECTED_COLUMNS) {
      expect(OWNER_EDITABLE_COLUMNS).not.toContain(col as never);
    }
  });
  it("does not allow editing trust/score fields", () => {
    for (const col of ["trust_score", "trust_flags", "provider_score", "provider_tier"]) {
      expect(OWNER_EDITABLE_COLUMNS).not.toContain(col as never);
    }
  });
  it("does allow editing bio, pricing, address, categories", () => {
    for (const col of ["bio", "public_bio", "hourly_rate", "base_address_place_id", "service_categories", "is_public"]) {
      expect(OWNER_EDITABLE_COLUMNS).toContain(col as never);
    }
  });
  it("never lists an approval/rejection/suspension timestamp", () => {
    const forbidden = /(approved|rejected|suspended|activated|archived|submitted)_(at|by|reason)/;
    for (const col of OWNER_EDITABLE_COLUMNS) {
      expect(col).not.toMatch(forbidden);
    }
  });
});
