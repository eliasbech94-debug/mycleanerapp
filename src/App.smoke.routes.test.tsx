import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

// Neutralize guards so alias routes render their target directly.
// The legal re-acceptance gate needs AuthProvider; route tests render the
// router in isolation, so it is stubbed out here.
vi.mock("@/components/legal/LegalUpdateGate", () => ({
  LegalUpdateGate: () => null,
  default: () => null,
}));
vi.mock("@/components/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./pages/FAQ", () => ({ default: () => <main data-testid="faq">FAQ</main> }));
vi.mock("./pages/Regler", () => ({ default: () => <main data-testid="regler">Regler</main> }));
vi.mock("./pages/Contact", () => ({ default: () => <main data-testid="contact">Contact</main> }));
vi.mock("./pages/mobile/MobileInboxGate", () => ({ default: () => <main data-testid="inbox">Inbox</main> }));
vi.mock("./pages/Profile", () => ({ default: () => <main data-testid="profile">Profile</main> }));
vi.mock("./pages/SupportCenter", () => ({ default: () => <main data-testid="support-center">Support Center</main> }));
vi.mock("./pages/NotFound", () => ({ default: () => <main data-testid="not-found">NotFound</main> }));

import { RootRouteSwitch } from "./App";
import { settleLazyRoute } from "@/test/settleLazyRoute";

async function renderAt(path: string) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <RootRouteSwitch />
    </MemoryRouter>,
  );
  // Route pages are code-split; wait for the chunk to resolve.
  await settleLazyRoute();
  return result;
}

describe("public alias routes", () => {
  it("/help renders the customer Support Center", async () => {
    await renderAt("/help");
    expect(screen.getByTestId("support-center")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it.each(["/hjaelp", "/kundesupport", "/contact-support"])(
    "%s redirects to the Support Center",
    async (path) => {
      await renderAt(path);
      expect(screen.getByTestId("support-center")).toBeInTheDocument();
    },
  );

  it("/house-rules redirects to /regler", async () => {
    await renderAt("/house-rules");
    expect(screen.getByTestId("regler")).toBeInTheDocument();
  });

  it("/chat redirects to /inbox", async () => {
    await renderAt("/chat");
    expect(screen.getByTestId("inbox")).toBeInTheDocument();
  });

  it("/contact renders the Contact page (no redirect to FAQ)", async () => {
    await renderAt("/contact");
    expect(screen.getByTestId("contact")).toBeInTheDocument();
    expect(screen.queryByTestId("faq")).not.toBeInTheDocument();
  });

  it("/customer/cards redirects to the profile cards tab", async () => {
    // MobileProfileGate lazily selects Profile via ?tab=cards; we only assert
    // that the redirect target resolves without hitting NotFound.
    await renderAt("/customer/cards");
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("unknown route still resolves to NotFound", async () => {
    await renderAt("/definitely-not-a-route");
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
  });
});
