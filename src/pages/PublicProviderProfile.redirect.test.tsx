import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PublicProviderProfile from "./PublicProviderProfile";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, profile: null, loading: false }) }));
vi.mock("@/context/AppContext", () => ({
  useAppContext: () => ({
    setProviderLock: vi.fn(), setProviderHint: vi.fn(),
    clearProviderLock: vi.fn(), campaign: null,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

beforeEach(() => rpcMock.mockReset());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/p/:slug" element={<PublicProviderProfile />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PublicProviderProfile slug resolver", () => {
  it("redirects when resolve_slug_v1 returns redirect (preserves query)", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "resolve_slug_v1") return { data: [{ status: "redirect", slug: "marie-new" }], error: null };
      return { data: [], error: null };
    });
    renderAt("/p/marie-old?src=marketplace_pick");
    await waitFor(() => {
      // After redirect, effect on new slug should have called resolve again
      const calls = rpcMock.mock.calls.filter(([n]) => n === "resolve_slug_v1");
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[1][1]).toEqual({ _slug: "marie-new" });
    });
  });

  it("renders not-found for status=not_found", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "resolve_slug_v1") return { data: [{ status: "not_found", slug: null }], error: null };
      return { data: [], error: null };
    });
    renderAt("/p/nothing");
    await waitFor(() => {
      expect(screen.getByText(/Provider ikke fundet/i)).toBeTruthy();
    });
  });
});
