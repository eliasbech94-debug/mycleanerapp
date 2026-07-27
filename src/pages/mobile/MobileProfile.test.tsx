/**
 * Phase 5A — MobileProfile role/rows tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockUser: any = null;
let mockRoles: any = { isCustomer: false, isProvider: false, isAdmin: false, isEmployee: false, isSupport: false, loading: false };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockUser ? { full_name: "Alice", id: mockUser.id } : null, loading: false }),
}));
vi.mock("@/hooks/useUserRoles", () => ({ useUserRoles: () => mockRoles }));
vi.mock("@/context/ActiveMarketContext", () => ({
  useActiveMarket: () => ({ market: { code: "DK", label: "Denmark" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k, i18n: { language: "en" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: async () => ({ error: null }) } },
}));

import MobileProfile from "./MobileProfile";
import { shouldShowMobileProfileLanding } from "./MobileProfileGate";

function wrap() {
  return render(
    <MemoryRouter>
      <MobileProfile />
    </MemoryRouter>,
  );
}

describe("MobileProfile", () => {
  it("guest sees sign-in row only, no account rows", () => {
    mockUser = null;
    mockRoles = { isCustomer: false, isProvider: false, isAdmin: false, isEmployee: false, isSupport: false };
    wrap();
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.queryByText("Personal information")).toBeNull();
    expect(screen.queryByText("Cards & payments")).toBeNull();
    expect(screen.queryByText("Payouts")).toBeNull();
  });

  it("customer sees cards but not payouts", () => {
    mockUser = { id: "u1", email: "u@e" };
    mockRoles = { isCustomer: true, isProvider: false };
    wrap();
    expect(screen.getByText("Cards & payments")).toBeTruthy();
    expect(screen.queryByText("Payouts")).toBeNull();
    expect(screen.getByText("Sign out")).toBeTruthy();
  });

  it("provider sees payouts but not customer cards", () => {
    mockUser = { id: "u2", email: "p@e" };
    mockRoles = { isCustomer: false, isProvider: true };
    wrap();
    expect(screen.getByText("Payouts")).toBeTruthy();
    expect(screen.queryByText("Cards & payments")).toBeNull();
  });

  it("language and country appear as separate rows", () => {
    mockUser = { id: "u1", email: "u@e" };
    mockRoles = { isCustomer: true };
    wrap();
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Country")).toBeTruthy();
  });
});

describe("MobileProfileGate shouldShowMobileProfileLanding", () => {
  it("shows landing only when below-md AND no tab param", () => {
    expect(shouldShowMobileProfileLanding(true, false)).toBe(true);
    expect(shouldShowMobileProfileLanding(true, true)).toBe(false);
    expect(shouldShowMobileProfileLanding(false, false)).toBe(false);
    expect(shouldShowMobileProfileLanding(false, true)).toBe(false);
  });
});
