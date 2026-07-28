import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

// --- Mocks -----------------------------------------------------------

const mockRoles = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuth(),
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => mockRoles(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

import { RoleGuard } from "@/components/RoleGuard";

function renderAt(path: string, allow: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <RoleGuard allow={allow as any}>
              <main data-testid="protected">Secret</main>
            </RoleGuard>
          }
        />
        <Route path="/login" element={<main data-testid="login">Login</main>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoleGuard — Phase 5 role protection", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRoles.mockReset();
  });

  it("redirects logged-out users to /login", async () => {
    mockAuth.mockReturnValue({ user: null, loading: false });
    mockRoles.mockReturnValue({ roles: [], isSuperAdmin: false, loading: false });
    renderAt("/customer", ["customer"]);
    await waitFor(() => expect(screen.getByTestId("login")).toBeInTheDocument());
  });

  it("blocks customer from provider-only routes", () => {
    mockAuth.mockReturnValue({ user: { id: "u1", email: "c@x.dk" }, loading: false });
    mockRoles.mockReturnValue({ roles: ["customer"], isSuperAdmin: false, loading: false });
    renderAt("/provider", ["provider", "admin"]);
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(screen.getByText(/Ingen adgang/i)).toBeInTheDocument();
  });

  it("blocks provider from customer-only routes", () => {
    mockAuth.mockReturnValue({ user: { id: "u2", email: "p@x.dk" }, loading: false });
    mockRoles.mockReturnValue({ roles: ["provider"], isSuperAdmin: false, loading: false });
    renderAt("/customer", ["customer"]);
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(screen.getByText(/Ingen adgang/i)).toBeInTheDocument();
  });

  it("grants access when role matches", () => {
    mockAuth.mockReturnValue({ user: { id: "u3", email: "c@x.dk" }, loading: false });
    mockRoles.mockReturnValue({ roles: ["customer"], isSuperAdmin: false, loading: false });
    renderAt("/customer", ["customer"]);
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("super_admin bypasses all role gates", () => {
    mockAuth.mockReturnValue({ user: { id: "u4", email: "a@x.dk" }, loading: false });
    mockRoles.mockReturnValue({ roles: [], isSuperAdmin: true, loading: false });
    renderAt("/support", ["support", "admin"]);
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });
});
