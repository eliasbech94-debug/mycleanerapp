/**
 * MobileSearch — presentation tests (Phase 4).
 *
 * Mocks hooks/context so no network. Verifies:
 *  - Guest access (renders without a user).
 *  - Active-market scoping (query receives market.code).
 *  - Loading, populated, empty, error states.
 *  - Filter chip + reset behaviour.
 *  - Provider CTA points at /p/:slug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const marketState: { code: string; neutral: boolean } = { code: "DK", neutral: false };
const providersState: {
  data: unknown[] | null;
  total: number;
  loading: boolean;
  error: null | { code: string; message: string };
  lastQuery: unknown;
} = { data: [], total: 0, loading: false, error: null, lastQuery: null };

vi.mock("@/context/ActiveMarketContext", () => ({
  useActiveMarket: () => ({
    market: { code: marketState.code, currency: "DKK", name: "DK" },
    isNeutral: marketState.neutral,
    source: "user_profile",
    markets: [],
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, profile: null }),
}));

vi.mock("@/hooks/useMarketplaceProviders", () => ({
  useMarketplaceProviders: (q: unknown) => {
    providersState.lastQuery = q;
    return {
      data: providersState.data,
      total: providersState.total,
      loading: providersState.loading,
      error: providersState.error,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, d?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      // Support both t(key, default) and t(key, { n: 5 })
      const params = typeof d === "object" ? d : opts;
      let out = typeof d === "string" ? d : k;
      if (params) for (const [pk, pv] of Object.entries(params)) out = out.replace(`{{${pk}}}`, String(pv));
      return out;
    },
    i18n: { language: "da" },
  }),
}));

async function importPage() {
  return (await import("./MobileSearch")).default;
}



beforeEach(() => {
  vi.resetModules();
  marketState.code = "DK";
  marketState.neutral = false;
  providersState.data = [];
  providersState.total = 0;
  providersState.loading = false;
  providersState.error = null;
  providersState.lastQuery = null;
});
afterEach(() => cleanup());

async function renderPage() {
  const Page = await importPage();
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

describe("MobileSearch", () => {
  it("renders for guests (no user) and shows empty state", async () => {
    await renderPage();
    expect(screen.getByText("Ingen Cleaners matcher dine filtre")).toBeTruthy();
  });

  it("passes active-market country code to the shared search query", async () => {
    marketState.code = "SE";
    await renderPage();
    expect((providersState.lastQuery as { countryCode: string }).countryCode).toBe("SE");
  });

  it("sends null country when market is neutral", async () => {
    marketState.neutral = true;
    await renderPage();
    expect((providersState.lastQuery as { countryCode: string | null }).countryCode).toBeNull();
  });

  it("shows loading skeletons", async () => {
    providersState.loading = true;
    const { container } = await renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows populated results with /p/:slug CTA", async () => {
    providersState.data = [
      {
        provider_slug: "clara-k",
        display_name: "Clara K",
        avatar_url: null,
        marketplace_score: 90,
        provider_tier: "verified",
        country_code: "DK",
        service_categories: ["cleaning"],
        price_from: 210,
        service_radius_km: 15,
        public_bio: "Grundig og hurtig.",
        avg_response_minutes: 20,
        identity_verified_badge: true,
        average_rating: 4.8,
        total_reviews: 42,
        completed_bookings: 100,
        total_count: 1,
      },
    ];
    providersState.total = 1;
    await renderPage();
    const link = screen.getByRole("link", { name: /Clara K/i });
    expect(link.getAttribute("href")).toMatch(/^\/p\/clara-k/);
  });

  it("shows error state with retry", async () => {
    providersState.error = { code: "rpc_failed", message: "boom" };
    await renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prøv igen" })).toBeTruthy();
  });

  it("reset button clears filter chips back to 'Alle'", async () => {
    await renderPage();
    const cleaningTab = screen.getByRole("tab", { name: "cleaning" });
    fireEvent.click(cleaningTab);
    expect(cleaningTab.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Nulstil filtre" }));
    expect(screen.getByRole("tab", { name: "Alle" }).getAttribute("aria-selected")).toBe("true");
  });
});
