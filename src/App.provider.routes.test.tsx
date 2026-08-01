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
  isValidCountryParam: (p?: string) => !!p && ["dk", "gb", "se", "es", "de"].includes(p.toLowerCase()),
  SUPPORTED_COUNTRIES: ["DK", "GB", "SE", "ES", "DE"],
}));
vi.mock("@/components/legal/LegalUpdateGate", () => ({
  LegalUpdateGate: () => null,
  default: () => null,
}));
vi.mock("@/components/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/pages/provider/ProviderDashboardV2", () => ({
  default: () => <main data-testid="provider-dashboard">ProviderDashboardV2</main>,
}));
vi.mock("@/pages/provider/ProviderProfileV2", () => ({
  default: () => <main data-testid="provider-profile">ProviderProfileV2</main>,
}));
vi.mock("@/pages/provider/ProviderOnboarding", () => ({
  default: () => <main data-testid="provider-onboarding">ProviderOnboarding</main>,
}));
vi.mock("./pages/ProviderFinance", () => ({
  default: () => <main data-testid="provider-finance">ProviderFinance</main>,
}));
vi.mock("./pages/FindCleaner", () => ({ default: () => null }));
vi.mock("./pages/ProviderProfile", () => ({ default: () => null }));
vi.mock("./pages/BookingFlow", () => ({ default: () => null }));
vi.mock("./pages/BookingEntry", () => ({ default: () => null }));
vi.mock("./pages/FAQ", () => ({ default: () => null }));
vi.mock("./pages/AdminDashboard", () => ({ default: () => null }));
vi.mock("./pages/NotFound", () => ({
  default: () => <main data-testid="not-found">NotFound</main>,
}));

import { RootRouteSwitch } from "./App";

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootRouteSwitch />
    </MemoryRouter>,
  );
}

describe("provider routes", () => {
  it("renders the canonical dashboard at /provider-dashboard", async () => {
    at("/provider-dashboard");
    expect(await screen.findByTestId("provider-dashboard")).toBeInTheDocument();
  });

  it("redirects /provider to the canonical dashboard", async () => {
    at("/provider");
    expect(await screen.findByTestId("provider-dashboard")).toBeInTheDocument();
  });

  it.each([
    "/provider/onboarding",
    "/provider/documents",
    "/provider/payouts",
    "/provider/bookings",
    "/provider/reviews",
  ])("%s is not a 404", async (path) => {
    at(path);
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("keeps the market prefix when redirecting /dk/provider", async () => {
    at("/dk/provider");
    expect(await screen.findByTestId("provider-dashboard")).toBeInTheDocument();
  });

  it("renders prefixed provider sub-pages", async () => {
    at("/dk/provider/profile");
    expect(await screen.findByTestId("provider-profile")).toBeInTheDocument();
  });
});
