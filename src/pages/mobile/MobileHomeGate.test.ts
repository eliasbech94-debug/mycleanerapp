import { describe, it, expect } from "vitest";
import { shouldUseMobileHome } from "./MobileHomeGate";

const R = {
  isAdmin: false,
  isSuperAdmin: false,
  isEmployee: false,
  isSupport: false,
  isProvider: false,
  isCustomer: false,
};

describe("MobileHomeGate — shouldUseMobileHome", () => {
  it("routes guests to MobileHome", () => {
    expect(shouldUseMobileHome(R, false)).toBe(true);
  });

  it("routes plain customers to MobileHome", () => {
    expect(shouldUseMobileHome({ ...R, isCustomer: true }, true)).toBe(true);
  });

  it("routes providers to MobileHome", () => {
    expect(shouldUseMobileHome({ ...R, isProvider: true }, true)).toBe(true);
  });

  it("keeps admin-only accounts on the desktop Index", () => {
    expect(shouldUseMobileHome({ ...R, isAdmin: true }, true)).toBe(false);
  });

  it("keeps super_admin, employee and support-only accounts on desktop Index", () => {
    expect(shouldUseMobileHome({ ...R, isSuperAdmin: true }, true)).toBe(false);
    expect(shouldUseMobileHome({ ...R, isEmployee: true }, true)).toBe(false);
    expect(shouldUseMobileHome({ ...R, isSupport: true }, true)).toBe(false);
  });

  it("routes multi-role admin+provider accounts to MobileHome (non-ops role present)", () => {
    expect(shouldUseMobileHome({ ...R, isAdmin: true, isProvider: true }, true)).toBe(true);
  });

  it("routes admin+customer accounts to MobileHome (non-ops role present)", () => {
    expect(shouldUseMobileHome({ ...R, isAdmin: true, isCustomer: true }, true)).toBe(true);
  });
});
