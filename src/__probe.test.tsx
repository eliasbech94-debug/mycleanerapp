import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/monitoring", () => ({ initSentry: vi.fn(), installFrontendMonitoring: vi.fn() }));
vi.mock("@/i18n/CountryContext", () => ({
  CountryProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  isValidCountryParam: (p?: string) => !!p && ["dk", "gb", "se", "es"].includes(p.toLowerCase()),
  SUPPORTED_COUNTRIES: ["DK", "GB", "SE", "ES"],
}));
vi.mock("@/components/legal/LegalUpdateGate", () => ({ LegalUpdateGate: () => null, default: () => null }));
vi.mock("@/components/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("./src/pages/mobile/MobileProfileGate", () => ({ default: () => <main data-testid="profil">profil</main> }));
vi.mock("@/pages/mobile/MobileProfileGate", () => ({ default: () => <main data-testid="profil">profil</main> }));
vi.mock("@/pages/NotFound", () => ({ default: () => <main data-testid="not-found">404</main> }));

import { RootRouteSwitch } from "@/App";

function Spy() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Spy />
      <RootRouteSwitch />
    </MemoryRouter>,
  );
}

describe("probe", () => {
  for (const p of ["/customer/notifications", "/dk/customer/notifications", "/inbox", "/dk/inbox", "/dk/profil"]) {
    it(`resolves ${p}`, () => {
      renderAt(p);
      // eslint-disable-next-line no-console
      console.log(p, "=>", screen.getByTestId("loc").textContent, "| notfound:", !!screen.queryByTestId("not-found"));
      expect(true).toBe(true);
    });
  }
});
