/**
 * Phase 1 — Role & Access Foundation route guard tests.
 * Verifies that /support/*, /admin/users, /admin/finance and /provider/finance
 * are wrapped in a RoleGuard with the correct allowed roles.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const guardCalls: Array<{ path: string; allow: string[] }> = [];

vi.mock("@/lib/monitoring", () => ({
  initSentry: vi.fn(),
  installFrontendMonitoring: vi.fn(),
}));

vi.mock("@/i18n/CountryContext", () => ({
  CountryProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  isValidCountryParam: (p?: string) => !!p && ["dk", "gb", "se", "es"].includes(p.toLowerCase()),
  SUPPORTED_COUNTRIES: ["DK", "GB", "SE", "ES"],
}));

// The legal re-acceptance gate needs AuthProvider; route tests render the
// router in isolation, so it is stubbed out here.
vi.mock("@/components/legal/LegalUpdateGate", () => ({
  LegalUpdateGate: () => null,
  default: () => null,
}));
vi.mock("@/components/RoleGuard", () => ({
  RoleGuard: ({ allow, children }: { allow: string[]; children: ReactNode }) => {
    // Record every guard rendered on the current route.
    guardCalls.push({ path: window.location?.pathname ?? "", allow });
    return <div data-testid="guard" data-allow={allow.join(",")}>{children}</div>;
  },
}));

vi.mock("./pages/FindCleaner", () => ({ default: () => <main data-testid="find-cleaner">x</main> }));
vi.mock("./pages/ProviderProfile", () => ({ default: () => <main data-testid="provider-profile">x</main> }));
vi.mock("./pages/BookingFlow", () => ({ default: () => <main data-testid="booking-flow">x</main> }));
vi.mock("./pages/BookingEntry", () => ({ default: () => <main data-testid="booking-entry">x</main> }));
vi.mock("./pages/FAQ", () => ({ default: () => <main data-testid="faq">x</main> }));
vi.mock("./pages/AdminDashboard", () => ({ default: () => <main data-testid="admin">x</main> }));
vi.mock("./pages/NotFound", () => ({ default: () => <main data-testid="not-found">x</main> }));
vi.mock("./pages/admin/AdminUsers", () => ({ default: () => <main data-testid="admin-users">x</main> }));
vi.mock("./pages/EmployeeDashboard", () => ({ default: () => <main data-testid="employee-dash">x</main> }));
vi.mock("./pages/finance/FinancePages", () => ({
  ProviderFinance: () => <main data-testid="provider-finance">provider-finance</main>,
  AdminFinance: () => <main data-testid="admin-finance">admin-finance</main>,
}));
vi.mock("./pages/support/SupportShell", () => ({
  SupportHome: () => <main data-testid="support-home">support</main>,
  SupportDashboard: () => <main data-testid="support-dashboard">dashboard</main>,
  SupportInbox: () => <main data-testid="support-inbox">inbox</main>,
  SupportCases: () => <main data-testid="support-cases">cases</main>,
  SupportCustomers: () => <main data-testid="support-customers">customers</main>,
  SupportProviders: () => <main data-testid="support-providers">providers</main>,
  SupportBookings: () => <main data-testid="support-bookings">bookings</main>,
}));

import { RootRouteSwitch } from "./App";
import { settleLazyRoute } from "@/test/settleLazyRoute";

async function renderAt(path: string) {
  guardCalls.length = 0;
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <RootRouteSwitch />
    </MemoryRouter>,
  );
  // Route pages are code-split; wait for the chunk to resolve.
  await settleLazyRoute();
  return result;
}

function guardAllowFor(testId: string) {
  const el = screen.getByTestId(testId).parentElement;
  return el?.getAttribute("data-allow")?.split(",") ?? [];
}

describe("Phase 1 role guards", () => {
  it("guards /admin/users with admin", async () => {
    await renderAt("/admin/users");
    expect(screen.getByTestId("admin-users")).toBeInTheDocument();
    expect(guardAllowFor("admin-users")).toEqual(["admin"]);
  });

  it("guards /admin/finance with admin only (employee removed)", async () => {
    await renderAt("/admin/finance");
    expect(screen.getByTestId("admin-finance")).toBeInTheDocument();
    expect(guardAllowFor("admin-finance")).toEqual(["admin"]);
  });

  it("guards /provider/finance at the router level", async () => {
    await renderAt("/provider/finance");
    expect(screen.getByTestId("provider-finance")).toBeInTheDocument();
    expect(guardAllowFor("provider-finance")).toEqual(["provider", "admin"]);
  });

  it("guards /employee with employee only (no admin fallthrough)", async () => {
    await renderAt("/employee");
    // employee route stubs don't matter; we just verify the guard.
    // No test id to grab, but the guard was rendered.
    expect(guardCalls.some((g) => g.allow.join(",") === "employee")).toBe(true);
  });

  for (const [route, testId] of [
    ["/support", "support-home"],
    ["/support/inbox", "support-inbox"],
    ["/support/cases", "support-cases"],
    ["/support/customers", "support-customers"],
    ["/support/providers", "support-providers"],
    ["/support/bookings", "support-bookings"],
  ] as const) {
    it(`guards ${route} with support+admin`, async () => {
      await renderAt(route);
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(guardAllowFor(testId)).toEqual(["support", "admin"]);
    });
  }
});
