/**
 * MobileHome — authenticated variant tests (customer + provider).
 *
 * Test-only rendering harness:
 *  - Mocks hooks and the Supabase client so no network, RLS, or auth flow is
 *    touched.
 *  - Does NOT introduce any production route, backdoor, or bundle change.
 *  - This file matches the vitest `include` pattern and is excluded from the
 *    production Vite bundle by construction (Vite only bundles files imported
 *    from `src/main.tsx`; `.test.tsx` are never reachable at runtime).
 *
 * Covers customer/provider greeting, loading/populated/empty/error states,
 * onboarding progress, honest earnings state, quick-action routes, and
 * absence of cross-role sections.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// ------------------------------ mocks ------------------------------------

const authState: {
  user: { id: string; user_metadata?: Record<string, unknown>; email?: string } | null;
  profile: { full_name?: string | null } | null;
  loading: boolean;
} = { user: null, profile: null, loading: false };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authState.user,
    session: authState.user ? { user: authState.user } : null,
    profile: authState.profile,
    loading: authState.loading,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const rolesState: {
  isProvider: boolean;
  isCustomer: boolean;
  loading: boolean;
} = { isProvider: false, isCustomer: true, loading: false };

vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({
    roles: [],
    loading: rolesState.loading,
    hasRole: () => false,
    isSuperAdmin: false,
    isAdmin: false,
    isSupport: false,
    isEmployee: false,
    isProvider: rolesState.isProvider,
    isCustomer: rolesState.isCustomer,
  }),
}));

vi.mock("@/context/ActiveMarketContext", () => ({
  useActiveMarket: () => ({
    market: { code: "DK", currency: "DKK", name: "Denmark" },
    isNeutral: false,
    source: "user_profile",
    markets: [],
  }),
}));

vi.mock("@/hooks/useMarketplaceProviders", () => ({
  useMarketplaceProviders: () => ({ data: [], loading: false, error: null }),
}));

vi.mock("@/components/marketplace/ServiceCategoryGrid", () => ({
  ServiceCategoryGrid: () => <div data-testid="service-grid" />,
}));

vi.mock("@/components/marketplace/CountryConfirmDialog", () => ({
  CountryConfirmDialog: () => <div data-testid="country-dialog" />,
}));

vi.mock("@/components/marketplace/home/HomeSections", () => ({
  HomeSections: ({ slot }: { slot: string }) => <div data-testid={`home-sections-${slot}`} />,
}));

// Chained supabase mock: from(t).select(...).eq(...).order(...) etc. and
// terminal .maybeSingle(). Configure return per test via `supabaseReturn`.
type QueryResult = { data: unknown; error: { message: string } | null };
const supabaseReturns: Record<string, QueryResult> = {
  bookings: { data: [], error: null },
  provider_profiles: { data: null, error: null },
};

function makeQuery(table: string) {
  const result = () => supabaseReturns[table] ?? { data: null, error: null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result()),
    maybeSingle: () => Promise.resolve(result()),
    then: (onFulfilled: (v: QueryResult) => unknown) =>
      Promise.resolve(result()).then(onFulfilled),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

// i18n: return the fallback string synchronously.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallbackOrOpts?: unknown, opts?: unknown) => {
      if (typeof fallbackOrOpts === "string") {
        const o = (opts as Record<string, unknown> | undefined) ?? {};
        return fallbackOrOpts.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o[k] ?? ""));
      }
      const o = (fallbackOrOpts as Record<string, unknown> | undefined) ?? {};
      const dv = (o.defaultValue as string | undefined) ?? "";
      return dv.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o[k] ?? ""));
    },
    i18n: { language: "da" },
  }),
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// ------------------------------ helper -----------------------------------

async function renderMobileHome() {
  // Import lazily so mocks apply.
  const { default: MobileHome } = await import("./MobileHome");
  return render(
    <MemoryRouter>
      <MobileHome />
    </MemoryRouter>,
  );
}

// Flush pending microtasks (supabase promise resolution + setState).
async function flushEffects() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
}

beforeEach(() => {
  cleanup();
  authState.user = null;
  authState.profile = null;
  authState.loading = false;
  rolesState.isProvider = false;
  rolesState.isCustomer = true;
  rolesState.loading = false;
  supabaseReturns.bookings = { data: [], error: null };
  supabaseReturns.provider_profiles = { data: null, error: null };
});

// ------------------------------ Customer ---------------------------------

describe("MobileHome — customer variant", () => {
  beforeEach(() => {
    authState.user = { id: "cust-1", user_metadata: { full_name: "Anna Jensen" } };
    authState.profile = { full_name: "Anna Jensen" };
    rolesState.isCustomer = true;
    rolesState.isProvider = false;
  });

  it("renders named greeting", async () => {
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Anna/);
  });

  it("shows populated upcoming booking with valid link", async () => {
    supabaseReturns.bookings = {
      data: [
        {
          id: "b1",
          provider_name: "Mette from Copenhagen with a very long provider name to stress overflow",
          service: "cleaning",
          booking_date: new Date(Date.now() + 86400000).toISOString(),
          slot: "10:00-12:00",
          address: "Nørrebrogade 12, 2200 København N with a very long street to stress overflow behavior",
          status: "accepted",
        },
      ],
      error: null,
    };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText(/Mette from Copenhagen/)).toBeInTheDocument();
    const link = screen.getByText(/Mette from Copenhagen/).closest("a")!;
    expect(link.getAttribute("href")).toBe("/mine-bookinger");
    // Overflow-safe: truncating classes present on long-content spans
    expect(link.querySelector(".truncate")).toBeTruthy();
  });

  it("shows empty state when no upcoming bookings", async () => {
    supabaseReturns.bookings = { data: [], error: null };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText(/ingen kommende bookinger/i)).toBeInTheDocument();
  });

  it("shows error state when bookings query fails", async () => {
    supabaseReturns.bookings = { data: null, error: { message: "boom" } };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText(/kunne ikke hente bookinger/i)).toBeInTheDocument();
  });

  it("quick-action routes point to valid customer paths", async () => {
    await renderMobileHome();
    await flushEffects();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/find-cleaner", "/profil?tab=inbox"]));
  });

  it("does NOT render provider-only sections (Today, Next opgave, Onboarding, Finans)", async () => {
    await renderMobileHome();
    await flushEffects();
    expect(screen.queryByText(/I dag/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Næste opgave/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kom i gang/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Månedens indtjening/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Åbn Finans/)).not.toBeInTheDocument();
  });

  it("marks the audience as customer at the root", async () => {
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByTestId("mobile-home").getAttribute("data-audience")).toBe("customer");
  });
});

// ------------------------------ Provider ---------------------------------

describe("MobileHome — provider variant", () => {
  beforeEach(() => {
    authState.user = { id: "prov-1", user_metadata: { full_name: "Jonas Berg" } };
    authState.profile = { full_name: "Jonas Berg" };
    rolesState.isCustomer = false;
    rolesState.isProvider = true;
  });

  it("renders provider greeting with first name", async () => {
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Jonas/);
  });

  it("populated today/next when bookings exist", async () => {
    const today = new Date();
    const iso = today.toISOString();
    supabaseReturns.bookings = {
      data: [
        { id: "j1", service: "Rengøring", booking_date: iso, slot: "09:00-11:00", address: "Strøget 1", status: "accepted" },
        { id: "j2", service: "Rengøring", booking_date: new Date(Date.now() + 86400000).toISOString(), slot: "13:00", address: "Vestergade 2", status: "pending" },
      ],
      error: null,
    };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText("1")).toBeInTheDocument(); // 1 active today
    expect(screen.getByText("Rengøring")).toBeInTheDocument();
  });

  it("empty today count + no-next-jobs state", async () => {
    supabaseReturns.bookings = { data: [], error: null };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/ingen kommende opgaver/i)).toBeInTheDocument();
  });

  it("error state when bookings query fails", async () => {
    supabaseReturns.bookings = { data: null, error: { message: "boom" } };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText(/kunne ikke hente jobs/i)).toBeInTheDocument();
  });

  it("renders onboarding progress when incomplete", async () => {
    supabaseReturns.provider_profiles = {
      data: {
        identity_verified_at: null,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        bank_verified: false,
        display_name: "Jonas Cleaning",
        bio: "",
      },
      error: null,
    };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByText(/Kom i gang/)).toBeInTheDocument();
    expect(screen.getByText(/0 af 4 trin gennemført/)).toBeInTheDocument();
  });

  it("hides onboarding when all steps complete", async () => {
    supabaseReturns.provider_profiles = {
      data: {
        identity_verified_at: new Date().toISOString(),
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        bank_verified: true,
        display_name: "Jonas Cleaning",
        bio: "Bio here",
      },
      error: null,
    };
    await renderMobileHome();
    await flushEffects();
    expect(screen.queryByText(/Kom i gang/)).not.toBeInTheDocument();
  });

  it("finance card contains no fabricated earnings (no currency amounts)", async () => {
    await renderMobileHome();
    await flushEffects();
    const finance = screen.getByText(/Månedens indtjening/).closest("section")!;
    // No digit-followed-by-currency patterns rendered in the card.
    expect(within(finance).queryByText(/\d[\d.,\s]*\s?(kr|DKK|€|£|EUR)/i)).toBeNull();
    expect(within(finance).getByText(/Se din opdaterede indtjening/i)).toBeInTheDocument();
  });

  it("quick-action routes are valid provider paths", async () => {
    await renderMobileHome();
    await flushEffects();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/provider-dashboard", "/profil?tab=inbox", "/provider/finance"]),
    );
  });

  it("does NOT render customer-only sections (Kommende booking, Book igen)", async () => {
    await renderMobileHome();
    await flushEffects();
    expect(screen.queryByText(/Kommende booking/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Book igen/)).not.toBeInTheDocument();
  });

  it("marks the audience as provider at the root", async () => {
    await renderMobileHome();
    await flushEffects();
    expect(screen.getByTestId("mobile-home").getAttribute("data-audience")).toBe("provider");
  });
});

// ------------------------------ Cross-role safety ------------------------

describe("MobileHome — cross-role safety", () => {
  it("renders skeleton (no role-specific content) while roles resolve", async () => {
    authState.user = { id: "u", user_metadata: {} };
    authState.profile = null;
    rolesState.loading = true;
    await renderMobileHome();
    // No customer greeting, no provider Today section during skeleton.
    expect(screen.getByTestId("mobile-home-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/Kommende booking/)).not.toBeInTheDocument();
    expect(screen.queryByText(/I dag/)).not.toBeInTheDocument();
  });

  it("renders exactly one CountryConfirmDialog instance", async () => {
    authState.user = { id: "cust-1", user_metadata: { full_name: "Anna" } };
    authState.profile = { full_name: "Anna" };
    await renderMobileHome();
    await flushEffects();
    expect(screen.getAllByTestId("country-dialog")).toHaveLength(1);
  });
});
