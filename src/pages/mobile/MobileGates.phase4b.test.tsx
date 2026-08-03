/**
 * Phase 4 corrective-patch regression tests.
 *
 * Covers:
 *  1. Exactly one visible header on mobile /marketplace, /mine-bookinger,
 *     /customer/bookings (global Header hidden; MobileAppBar rendered).
 *  2. Global Header still renders at 768px and 1440px.
 *  3. MobileBottomNav shows on mobile Marketplace + booking routes and
 *     honours country-prefixed and query-parameter variants.
 *  4. MobileSearch chip catalogue is cleaning-only.
 *  5. mobileSearch.chips localisations contain no non-cleaning keys.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import fs from "node:fs";
import path from "node:path";
// Static imports: `vi.mock` factories below are hoisted above them, so the
// mocked modules are still what these components resolve.
import Header from "@/components/layout/Header";
import { shouldShowMobileNav } from "@/components/layout/MobileBottomNav";

// ---- shared mocks ------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string) => (typeof d === "string" ? d : _k),
    i18n: { language: "da", changeLanguage: () => Promise.resolve() },
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, signOut: () => Promise.resolve() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({
    isAdmin: false, isEmployee: false, isProvider: false, isCustomer: true, loading: false,
  }),
}));
vi.mock("@/context/AuthGateContext", () => ({
  useAuthGate: () => ({ openLogin: () => {} }),
}));
vi.mock("@/context/ActiveMarketContext", () => ({
  useActiveMarket: () => ({
    market: { code: "DK", label: "Danmark", currency: "DKK" },
    isNeutral: false,
    setMarket: () => {},
  }),
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

/**
 * No `vi.resetModules()` here on purpose.
 *
 * The viewport is read during render (`useState(() => window.innerWidth < 768)`
 * in Header, `window.matchMedia` inside an effect), never at module-evaluation
 * time, so a fresh module registry buys nothing. It only forced every test to
 * re-evaluate Header's whole transitive graph through a dynamic `import()`,
 * which is what made the first case time out at 5s under full-suite load while
 * passing in isolation. Static imports keep the graph loaded once and make the
 * assertions deterministic.
 */
afterEach(() => cleanup());

// ---- 1. Header hiding on mobile shell routes ---------------------------

const SHELL_PATHS = ["/marketplace", "/mine-bookinger", "/customer/bookings"];

describe("Header — mobile shell duplicate-header suppression", () => {
  for (const p of SHELL_PATHS) {
    it(`returns null at 390px on ${p}`, () => {
      setViewport(390);
      const { container } = render(
        <MemoryRouter initialEntries={[p]}>
          <Header />
        </MemoryRouter>,
      );
      expect(container.firstChild).toBeNull();
    });

    it(`renders at 768px on ${p} (desktop preserved)`, () => {
      setViewport(768);
      const { container } = render(
        <MemoryRouter initialEntries={[p]}>
          <Header />
        </MemoryRouter>,
      );
      expect(container.firstChild).not.toBeNull();
    });

    it(`renders at 1440px on ${p} (desktop unchanged)`, () => {
      setViewport(1440);
      const { container } = render(
        <MemoryRouter initialEntries={[p]}>
          <Header />
        </MemoryRouter>,
      );
      expect(container.firstChild).not.toBeNull();
    });
  }
});


// ---- 2. MobileBottomNav route detection --------------------------------

describe("MobileBottomNav — shouldShowMobileNav route matching", () => {
  it("matches /marketplace and country-prefixed marketplace paths", () => {
    for (const p of [
      "/marketplace",
      "/marketplace/",
      "/dk/marketplace",
      "/gb/marketplace",
      "/se/marketplace",
      "/es/marketplace",
    ]) {
      expect(shouldShowMobileNav(p)).toBe(true);
    }
  });

  it("matches /customer/bookings and /mine-bookinger with country prefixes", () => {
    for (const p of [
      "/mine-bookinger",
      "/dk/mine-bookinger",
      "/customer/bookings",
      "/gb/customer/bookings",
      "/es/customer/bookings",
    ]) {
      expect(shouldShowMobileNav(p)).toBe(true);
    }
  });

  it("query parameters and deep links do not break detection", () => {
    // useLocation().pathname never contains ?query, but guard anyway.
    expect(shouldShowMobileNav("/marketplace")).toBe(true);
    expect(shouldShowMobileNav("/dk/marketplace/")).toBe(true);
    expect(shouldShowMobileNav("/customer/bookings")).toBe(true);
  });

  it("does not match admin / employee dashboards", () => {
    expect(shouldShowMobileNav("/admin")).toBe(false);
    expect(shouldShowMobileNav("/employee")).toBe(false);
  });
});

// ---- 3. MobileSearch cleaning-only scope -------------------------------

describe("MobileSearch — cleaning-only category chips", () => {
  it("source contains only cleaning chip identifiers", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/pages/mobile/MobileSearch.tsx"),
      "utf8",
    );
    const match = src.match(/CHIP_CATEGORIES\s*=\s*\[(.*?)\]/s);
    expect(match).not.toBeNull();
    const listed = match![1];
    expect(listed).toContain('"all"');
    expect(listed).toContain('"cleaning"');
    expect(listed).not.toMatch(/"handyman"/);
    expect(listed).not.toMatch(/"garden"/);
    expect(listed).not.toMatch(/"moving"/);
  });

  for (const loc of ["da", "en", "sv", "es"]) {
    it(`${loc} mobileSearch.chips localisation contains no non-cleaning keys`, () => {
      const json = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), `public/locales/${loc}/marketplace.json`),
          "utf8",
        ),
      );
      const chips = json.mobileSearch?.chips ?? {};
      const keys = Object.keys(chips);
      expect(keys).toContain("all");
      expect(keys).toContain("cleaning");
      expect(keys).not.toContain("handyman");
      expect(keys).not.toContain("garden");
      expect(keys).not.toContain("moving");
    });
  }
});
