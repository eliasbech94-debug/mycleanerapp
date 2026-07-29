import { render, screen } from "@testing-library/react";
import { MemoryRouter, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("./pages/FindCleaner", () => ({ default: () => <main data-testid="find-cleaner">FindCleaner</main> }));
vi.mock("./pages/ProviderProfile", () => ({
  default: () => {
    const params = useParams();
    return <main data-testid="provider-profile">ProviderProfile:{params.id}</main>;
  },
}));
vi.mock("./pages/BookingFlow", () => ({
  default: () => {
    const params = useParams();
    return <main data-testid="booking-flow">BookingFlow:{params.id}</main>;
  },
}));
vi.mock("./pages/BookingEntry", () => ({ default: () => <main data-testid="booking-entry">BookingEntry</main> }));
vi.mock("./pages/FAQ", () => ({ default: () => <main data-testid="faq">FAQ</main> }));
vi.mock("./pages/AdminDashboard", () => ({ default: () => <main data-testid="admin">AdminDashboard</main> }));
vi.mock("./pages/NotFound", () => ({ default: () => <main data-testid="not-found">NotFound</main> }));

import { RootRouteSwitch } from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootRouteSwitch />
    </MemoryRouter>,
  );
}

describe("application route matching", () => {
  it("renders unprefixed marketplace routes before any country parsing", () => {
    renderAt("/find-cleaner");
    expect(screen.getByTestId("find-cleaner")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  const TEST_UUID = "11111111-1111-4111-8111-111111111111";

  it("passes provider id to unprefixed provider profile", () => {
    renderAt(`/provider/${TEST_UUID}`);
    expect(screen.getByTestId("provider-profile")).toHaveTextContent(`ProviderProfile:${TEST_UUID}`);
  });

  it("blocks the unprefixed booking calendar page in Early Access", () => {
    renderAt(`/book/${TEST_UUID}?slot=10:00`);
    expect(screen.getByTestId("early-access-blocked")).toBeInTheDocument();
    expect(screen.queryByTestId("booking-flow")).toBeNull();
  });

  it("renders country-prefixed find cleaner", () => {
    renderAt("/dk/find-cleaner");
    expect(screen.getByTestId("find-cleaner")).toBeInTheDocument();
  });

  it("passes provider id to country-prefixed provider profile", () => {
    renderAt(`/dk/provider/${TEST_UUID}`);
    expect(screen.getByTestId("provider-profile")).toHaveTextContent(`ProviderProfile:${TEST_UUID}`);
  });

  it("blocks the country-prefixed booking calendar page in Early Access", () => {
    renderAt(`/dk/book/${TEST_UUID}`);
    expect(screen.getByTestId("early-access-blocked")).toBeInTheDocument();
    expect(screen.queryByTestId("booking-flow")).toBeNull();
  });

  it("rejects non-UUID /provider/:id with UuidGuard", () => {
    renderAt("/provider/p_001");
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("provider-profile")).not.toBeInTheDocument();
  });


  it("does not interpret faq as a country prefix", () => {
    renderAt("/faq");
    expect(screen.getByTestId("faq")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("does not interpret admin as a country prefix", () => {
    renderAt("/admin");
    expect(screen.getByTestId("admin")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("keeps unknown country-like paths on the NotFound page", () => {
    renderAt("/xx/find-cleaner");
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
  });
});