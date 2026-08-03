import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// Stub the heavy composed hooks so we can exercise providerLock in isolation.
vi.mock("@/context/ActiveMarketContext", () => ({
  useActiveMarket: () => ({
    market: { code: "DK", locale: "da-DK", timezone: "Europe/Copenhagen", currency: "DKK" },
    isNeutral: false,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, profile: null, loading: false }),
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ roles: [] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) }) },
}));
vi.mock("@/lib/featureFlags", () => ({ hasFlag: async () => false }));

import { AppContextProvider, useAppContext } from "./AppContext";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AppContextProvider>{children}</AppContextProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("AppContext — providerLock", () => {
  it("setProviderLock persists a session-scoped lock and exposes it via useAppContext", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    expect(result.current.providerLock).toBeNull();

    act(() => {
      result.current.setProviderLock({
        slug: "anna-clean",
        source: "provider_direct_link",
        ref: "instagram",
        campaign: "spring24",
        landingUrl: "https://mycleaner.dk/p/anna-clean?src=provider_direct_link",
        firstSeenAt: "2026-07-25T10:00:00.000Z",
      });
    });

    expect(result.current.providerLock?.slug).toBe("anna-clean");
    expect(result.current.providerLock?.source).toBe("provider_direct_link");
    // Persisted to sessionStorage so page reload/back/forward restore it.
    const raw = JSON.parse(sessionStorage.getItem("mc.providerLock") || "{}");
    expect(raw.slug).toBe("anna-clean");
  });

  it("setProviderHint attaches a UI-only display hint without becoming authoritative", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    act(() => {
      result.current.setProviderLock({
        slug: "anna-clean", source: "marketplace_pick", ref: null, campaign: null,
        landingUrl: "http://x", firstSeenAt: "2026-07-25T10:00:00.000Z",
      });
    });
    act(() => { result.current.setProviderHint("anna-clean", "Anna N."); });

    expect(result.current.providerLock?.providerHint).toBe("Anna N.");
    // The hint field is intentionally NOT a UUID and NOT called providerId —
    // the server re-derives provider identity from the locked quote.
    expect(result.current.providerLock).not.toHaveProperty("providerId");
  });

  it("setProviderHint is ignored when the slug does not match the current lock", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    act(() => {
      result.current.setProviderLock({
        slug: "anna-clean", source: "marketplace_pick", ref: null, campaign: null,
        landingUrl: "http://x", firstSeenAt: "2026-07-25T10:00:00.000Z",
      });
    });
    act(() => { result.current.setProviderHint("someone-else", "Attacker"); });
    expect(result.current.providerLock?.providerHint).toBeUndefined();
  });

  it("clearProviderLock removes both in-memory state and sessionStorage", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    act(() => {
      result.current.setProviderLock({
        slug: "anna-clean", source: "provider_qr", ref: null, campaign: null,
        landingUrl: "http://x", firstSeenAt: "2026-07-25T10:00:00.000Z",
      });
    });
    expect(sessionStorage.getItem("mc.providerLock")).toBeTruthy();
    act(() => { result.current.clearProviderLock(); });
    expect(result.current.providerLock).toBeNull();
    expect(sessionStorage.getItem("mc.providerLock")).toBeNull();
  });

  it("migrates a legacy stored `providerId` field into the new `providerHint`", () => {
    // Simulate a pre-migration serialized lock produced by an older build.
    sessionStorage.setItem(
      "mc.providerLock",
      JSON.stringify({
        slug: "anna-clean",
        source: "provider_direct_link",
        ref: null,
        campaign: null,
        landingUrl: "http://x",
        firstSeenAt: "2026-07-25T10:00:00.000Z",
        providerId: "Anna N. (legacy)",
      }),
    );
    const { result } = renderHook(() => useAppContext(), { wrapper });
    expect(result.current.providerLock?.providerHint).toBe("Anna N. (legacy)");
    // Legacy field name is not surfaced.
    expect(result.current.providerLock as any).not.toHaveProperty("providerId");
  });

  it("survives a component unmount/remount (reload/back-forward analogue) via sessionStorage", () => {
    // First mount writes the lock.
    const first = renderHook(() => useAppContext(), { wrapper });
    act(() => {
      first.result.current.setProviderLock({
        slug: "anna-clean", source: "provider_social_share", ref: null, campaign: null,
        landingUrl: "http://x", firstSeenAt: "2026-07-25T10:00:00.000Z",
      });
    });
    first.unmount();

    // Fresh mount re-reads sessionStorage in its useState initialiser.
    const second = renderHook(() => useAppContext(), { wrapper });
    expect(second.result.current.providerLock?.slug).toBe("anna-clean");
    expect(second.result.current.providerLock?.source).toBe("provider_social_share");
  });

  it("useAppContext throws when consumed outside the provider", () => {
    // Suppress React's error boundary noise for the negative test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken() { useAppContext(); return null; }
    expect(() => render(<Broken />)).toThrow(/useAppContext/);
    spy.mockRestore();
  });
});
