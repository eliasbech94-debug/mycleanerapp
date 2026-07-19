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
vi.mock("@/components/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./pages/CustomerDashboard", () => ({
  default: () => <main data-testid="customer-dashboard">CustomerDashboard</main>,
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

describe("customer routes", () => {
  it("/customer renders customer dashboard", () => {
    at("/customer");
    expect(screen.getByTestId("customer-dashboard")).toBeInTheDocument();
  });
  it("/dk/customer renders customer dashboard", () => {
    at("/dk/customer");
    expect(screen.getByTestId("customer-dashboard")).toBeInTheDocument();
  });
  it("/customer/bookings reuses MyBookings", () => {
    at("/customer/bookings");
    expect(screen.getByTestId("my-bookings")).toBeInTheDocument();
  });
});
