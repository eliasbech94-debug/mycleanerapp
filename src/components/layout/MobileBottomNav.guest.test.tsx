/**
 * Regression: guest bottom navigation must render on mobile "/"
 * with Home / Search / Login / Menu tabs and a localized aria-label.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ isAdmin: false, isEmployee: false, isProvider: false }),
}));
vi.mock("@/context/AuthGateContext", () => ({
  useAuthGate: () => ({ openLogin: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, def?: string) => def ?? _k,
  }),
}));

import MobileBottomNav from "./MobileBottomNav";

describe("MobileBottomNav — guest on /", () => {
  it("renders Home / Search / Login / Menu with primary-navigation label", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileBottomNav />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: /primær navigation/i });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelectorAll("li").length).toBe(4);
    expect(nav.textContent).toMatch(/Hjem/);
    expect(nav.textContent).toMatch(/Søg/);
    expect(nav.textContent).toMatch(/Log ind/);
    expect(nav.textContent).toMatch(/Mere/);
  });
});
