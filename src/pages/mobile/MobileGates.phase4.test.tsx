/**
 * MobileMarketplaceGate / MobileBookingsGate — viewport branching tests.
 *
 * Verifies that below 768px the mobile screen renders and at/above 768px the
 * existing desktop component renders verbatim. No production routes/backdoors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";

// ---- shared mocks ------------------------------------------------------

vi.mock("@/pages/Marketplace", () => ({
  default: () => <div data-testid="desktop-marketplace">DESKTOP_MARKETPLACE</div>,
}));

vi.mock("@/pages/MyBookings", () => ({
  default: () => <div data-testid="desktop-mybookings">DESKTOP_MYBOOKINGS</div>,
}));

vi.mock("@/pages/mobile/MobileSearch", () => ({
  default: () => <div data-testid="mobile-search">MOBILE_SEARCH</div>,
}));

vi.mock("@/pages/mobile/MobileBookings", () => ({
  default: () => <div data-testid="mobile-bookings">MOBILE_BOOKINGS</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k, i18n: { language: "da" } }),
}));

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = ((q: string) => ({
    matches: /max-width/.test(q) && width < 768,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

async function importGates() {
  return {
    MobileMarketplaceGate: (await import("./MobileMarketplaceGate")).default,
    MobileBookingsGate: (await import("./MobileBookingsGate")).default,
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => cleanup());

describe("MobileMarketplaceGate", () => {
  it("renders desktop Marketplace at 768px", async () => {
    setViewport(768);
    const { MobileMarketplaceGate } = await importGates();
    render(
      <MemoryRouter>
        <Suspense fallback={null}><MobileMarketplaceGate /></Suspense>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("desktop-marketplace")).toBeTruthy();
    expect(screen.queryByTestId("mobile-search")).toBeNull();
  });

  it("renders MobileSearch inside shell at 767px", async () => {
    setViewport(767);
    const { MobileMarketplaceGate } = await importGates();
    render(
      <MemoryRouter>
        <Suspense fallback={null}><MobileMarketplaceGate /></Suspense>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("mobile-search")).toBeTruthy());
    expect(screen.queryByTestId("desktop-marketplace")).toBeNull();
    // Shell chrome present exactly once — no duplicated app bar.
    expect(screen.getAllByTestId("mobile-app-shell").length).toBe(1);
    expect(screen.getAllByTestId("mobile-app-bar").length).toBe(1);
  });
});

describe("MobileBookingsGate", () => {
  it("renders desktop MyBookings at 1024px", async () => {
    setViewport(1024);
    const { MobileBookingsGate } = await importGates();
    render(
      <MemoryRouter>
        <Suspense fallback={null}><MobileBookingsGate /></Suspense>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("desktop-mybookings")).toBeTruthy();
    expect(screen.queryByTestId("mobile-bookings")).toBeNull();
  });

  it("renders MobileBookings inside shell at 390px", async () => {
    setViewport(390);
    const { MobileBookingsGate } = await importGates();
    render(
      <MemoryRouter>
        <Suspense fallback={null}><MobileBookingsGate /></Suspense>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("mobile-bookings")).toBeTruthy());
    expect(screen.queryByTestId("desktop-mybookings")).toBeNull();
    expect(screen.getAllByTestId("mobile-app-shell").length).toBe(1);
    expect(screen.getAllByTestId("mobile-app-bar").length).toBe(1);
  });
});
