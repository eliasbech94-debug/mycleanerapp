import { describe, it, expect } from "vitest";
import { __OWNER_EDITABLE_COLUMNS, PROTECTED_COLUMNS } from "./ProviderProfile";

describe("ProviderProfile owner-safe column whitelist", () => {
  it("does not allow editing lifecycle fields", () => {
    for (const col of PROTECTED_COLUMNS) {
      expect(__OWNER_EDITABLE_COLUMNS).not.toContain(col as any);
    }
  });
  it("does not allow editing trust/score fields", () => {
    for (const col of ["trust_score", "trust_flags", "provider_score", "provider_tier"]) {
      expect(__OWNER_EDITABLE_COLUMNS).not.toContain(col as any);
    }
  });
  it("does allow editing bio, pricing, address, categories", () => {
    for (const col of ["bio", "public_bio", "hourly_rate", "base_address_place_id", "service_categories", "is_public"]) {
      expect(__OWNER_EDITABLE_COLUMNS).toContain(col as any);
    }
  });
  it("never lists an approval/rejection/suspension timestamp", () => {
    const forbidden = /(approved|rejected|suspended|activated|archived|submitted)_(at|by|reason)/;
    for (const col of __OWNER_EDITABLE_COLUMNS) {
      expect(col).not.toMatch(forbidden);
    }
  });
});
