/**
 * Guard regression: signed-out users hitting a guarded provider route must be
 * sent to the market-prefixed /login WITH a redirect back to the page they
 * asked for. Losing either the prefix or the destination dumped providers on a
 * generic dashboard after login.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const authState = { user: null as null | { id: string }, loading: false };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ roles: [], isSuperAdmin: false, loading: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

function LoginProbe() {
  const loc = useLocation();
  return <div data-testid="login">{loc.pathname + loc.search}</div>;
}

async function renderAt(path: string) {
  const { RoleGuard } = await import("@/components/RoleGuard");
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:country/login" element={<LoginProbe />} />
        <Route path="/login" element={<LoginProbe />} />
        <Route
          path="/:country/provider/finance"
          element={
            <RoleGuard allow={["provider"]}>
              <div>finance</div>
            </RoleGuard>
          }
        />
        <Route
          path="/provider/finance"
          element={
            <RoleGuard allow={["provider"]}>
              <div>finance</div>
            </RoleGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoleGuard signed-out redirect", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("preserves the market prefix and the destination", async () => {
    await renderAt("/dk/provider/finance");
    expect(screen.getByTestId("login").textContent).toBe(
      "/dk/login?redirect=%2Fdk%2Fprovider%2Ffinance",
    );
  });

  it("works without a market prefix", async () => {
    await renderAt("/provider/finance");
    expect(screen.getByTestId("login").textContent).toBe(
      "/login?redirect=%2Fprovider%2Ffinance",
    );
  });
});

export type _Unused = ReactNode;
