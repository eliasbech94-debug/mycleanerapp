import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProviderFeatureRoadmap } from "./ProviderFeatureRoadmap";
import { PROVIDER_FEATURE_ROADMAP } from "@/config/provider-feature-roadmap";
import { PROVIDER_APP_ROUTE_PATHS } from "@/config/provider-routes";

vi.mock("@/hooks/useProviderDashboard", () => ({
  useProviderDashboard: () => ({
    firstName: "Test",
    profile: null,
    todaysSchedule: [],
    openRequests: [],
    upcoming: [],
    recent: [],
    payouts: [],
    stats: {
      completed: 0,
      acceptanceRate: null,
      cancellationRate: null,
      avgResponseSeconds: null,
      earningsMinor: 0,
      currency: null,
      ratingAvg: null,
      ratingCount: null,
    },
    data: {} as never,
    loading: false,
    isLoading: false,
    error: null,
    sliceErrors: {
      profile: null,
      bookings: null,
      offers: null,
      payouts: null,
      cancellations: null,
    },
    refetch: async () => {},
  }),
}));

vi.mock("@/components/Inbox", () => ({
  useNotifications: () => ({ items: [], loading: false, refresh: async () => {} }),
}));

vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ hasRole: () => true, roles: [], loading: false }),
}));

afterEach(cleanup);

const ROADMAP_HEADING = "Nu og næste på MyCleaner";

describe("ProviderFeatureRoadmap", () => {
  it("keeps every locked feature free of a route", () => {
    const locked = PROVIDER_FEATURE_ROADMAP.filter((feature) => !feature.route);

    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((feature) => feature.route === undefined)).toBe(true);
  });

  it("only links to routes declared in the shared provider route constant", () => {
    const routes = PROVIDER_FEATURE_ROADMAP.flatMap((feature) =>
      feature.route ? [feature.route] : [],
    );

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(PROVIDER_APP_ROUTE_PATHS).toContain(route);
    }
  });

  it("opens a status dialog when a locked feature is clicked", () => {
    render(
      <MemoryRouter>
        <ProviderFeatureRoadmap />
      </MemoryRouter>,
    );

    const lockedCard = screen.getByRole("button", {
      name: /Introduktionsvideo: Under udvikling/i,
    });

    expect(lockedCard.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(lockedCard);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("Introduktionsvideo")).toBeTruthy();
    expect(within(dialog).getByText("Under udvikling")).toBeTruthy();
  });

  it("renders inside the provider dashboard page exactly once", async () => {
    const { default: ProviderDashboardV2 } = await import(
      "@/pages/provider/ProviderDashboardV2"
    );

    render(
      <MemoryRouter initialEntries={["/provider-dashboard"]}>
        <ProviderDashboardV2 />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("heading", { name: ROADMAP_HEADING })).toHaveLength(1);
  }, 20000);

  it("is not rendered by DashboardLayout on its own", async () => {
    const { DashboardLayout } = await import("@/components/dashboard/DashboardLayout");

    render(
      <MemoryRouter initialEntries={["/provider/pricing"]}>
        <DashboardLayout role="provider">
          <div>Anden providerside</div>
        </DashboardLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: ROADMAP_HEADING })).toBeNull();
    expect(screen.getByText("Anden providerside")).toBeTruthy();
  });
});
