import { render, screen } from "@testing-library/react";
import { MemoryRouter, useParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/CountryContext", () => ({
  CountryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  isValidCountryParam: (p?: string) => !!p && ["dk", "gb", "se", "es"].includes(p.toLowerCase()),
  SUPPORTED_COUNTRIES: ["DK", "GB", "SE", "ES"],
}));

vi.mock("@/components/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

  it("passes provider id to unprefixed provider profile", () => {
    renderAt("/provider/p_001");
    expect(screen.getByTestId("provider-profile")).toHaveTextContent("ProviderProfile:p_001");
  });

  it("passes provider id to unprefixed booking calendar page", () => {
    renderAt("/book/p_001?slot=10:00");
    expect(screen.getByTestId("booking-flow")).toHaveTextContent("BookingFlow:p_001");
  });

  it("renders country-prefixed find cleaner", () => {
    renderAt("/dk/find-cleaner");
    expect(screen.getByTestId("find-cleaner")).toBeInTheDocument();
  });

  it("passes provider id to country-prefixed provider profile", () => {
    renderAt("/dk/provider/p_001");
    expect(screen.getByTestId("provider-profile")).toHaveTextContent("ProviderProfile:p_001");
  });

  it("passes provider id to country-prefixed booking calendar page", () => {
    renderAt("/dk/book/p_001");
    expect(screen.getByTestId("booking-flow")).toHaveTextContent("BookingFlow:p_001");
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