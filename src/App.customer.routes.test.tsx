import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

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
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/pages/customer/CustomerDashboardV2", () => ({
  default: () => <main data-testid="customer-dashboard">CustomerDashboardV2</main>,
}));
vi.mock("@/pages/customer/CustomerProfileV2", () => ({
  default: () => <main data-testid="customer-profile-v2">CustomerProfileV2</main>,
}));
vi.mock("@/pages/provider/ProviderDashboardV2", () => ({
  default: () => <main data-testid="provider-dashboard-v2">ProviderDashboardV2</main>,
}));
vi.mock("@/pages/provider/ProviderProfileV2", () => ({
  default: () => <main data-testid="provider-profile-v2">ProviderProfileV2</main>,
}));
vi.mock("./pages/MyBookings", () => ({
  default: () => <main data-testid="my-bookings">MyBookings</main>,
}));
// Silence heavy imports in App.tsx
vi.mock("./pages/FindCleaner", () => ({ default: () => null }));
vi.mock("./pages/ProviderProfile", () => ({ default: () => null }));
vi.mock("./pages/BookingFlow", () => ({ default: () => null }));
vi.mock("./pages/BookingEntry", () => ({ default: () => null }));
vi.mock("./pages/FAQ", () => ({ default: () => null }));
vi.mock("./pages/AdminDashboard", () => ({ default: () => null }));
vi.mock("./pages/NotFound", () => ({ default: () => <main data-testid="not-found">NotFound</main> }));

import { RootRouteSwitch } from "./App";

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootRouteSwitch />
    </MemoryRouter>,
  );
}

vi.mock("./pages/mobile/MobileBookingsGate", () => ({
  default: () => <main data-testid="mobile-bookings">MobileBookings</main>,
}));

describe("customer routes (v2 only, legacy removed)", () => {
  it("/customer renders v2 dashboard", () => {
    at("/customer");
    expect(screen.getByTestId("customer-dashboard")).toBeInTheDocument();
  });
  it("/customer?legacy=1 still renders v2 (legacy gate removed)", () => {
    at("/customer?legacy=1");
    expect(screen.getByTestId("customer-dashboard")).toBeInTheDocument();
  });
  it("/dk/customer renders v2 dashboard", () => {
    at("/dk/customer");
    expect(screen.getByTestId("customer-dashboard")).toBeInTheDocument();
  });
  it("/customer/bookings routes to MobileBookingsGate", () => {
    at("/customer/bookings");
    expect(screen.getByTestId("mobile-bookings")).toBeInTheDocument();
  });
  it("/customer/profile renders v2 profile", () => {
    at("/customer/profile");
    expect(screen.getByTestId("customer-profile-v2")).toBeInTheDocument();
  });
  it("/customer/profile?legacy=1 still renders v2 (legacy gate removed)", () => {
    at("/customer/profile?legacy=1");
    expect(screen.getByTestId("customer-profile-v2")).toBeInTheDocument();
  });
});

describe("provider routes (v2 only, legacy removed)", () => {
  it("/provider renders v2 dashboard", () => {
    at("/provider");
    expect(screen.getByTestId("provider-dashboard-v2")).toBeInTheDocument();
  });
  it("/provider-dashboard renders v2 dashboard", () => {
    at("/provider-dashboard");
    expect(screen.getByTestId("provider-dashboard-v2")).toBeInTheDocument();
  });
  it("/provider?legacy=1 still renders v2 (legacy gate removed)", () => {
    at("/provider?legacy=1");
    expect(screen.getByTestId("provider-dashboard-v2")).toBeInTheDocument();
  });
  it("/provider/profile renders v2 profile", () => {
    at("/provider/profile");
    expect(screen.getByTestId("provider-profile-v2")).toBeInTheDocument();
  });
  it("/provider/profile?legacy=1 still renders v2 (legacy gate removed)", () => {
    at("/provider/profile?legacy=1");
    expect(screen.getByTestId("provider-profile-v2")).toBeInTheDocument();
  });
});
