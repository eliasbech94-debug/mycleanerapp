/**
 * Phase 5A — MobileMessages inbox surface tests.
 * Focuses on states (signed-out, empty, populated, error, retry) using the
 * existing `conversation-list` edge function as the trusted source.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Mocks ----
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const chan: any = {};
  chan.on = () => chan;
  chan.subscribe = () => chan;
  return {
    supabase: {
      functions: { invoke: (...a: unknown[]) => invoke(...(a as [any, any])) },
      channel: () => chan,
      removeChannel: () => {},
      auth: { signOut: async () => ({ error: null }) },
    },
  };
});

let mockUser: { id: string; email: string } | null = { id: "user-1", email: "u@example.com" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, loading: false, profile: null }),
}));
vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({
    isCustomer: true, isProvider: false, isAdmin: false, isEmployee: false, isSupport: false, loading: false,
  }),
}));
vi.mock("@/context/ActiveMarketContext", () => ({
  useActiveMarket: () => ({ market: { code: "DK", label: "Denmark" }, isNeutral: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k, i18n: { language: "en" } }),
}));

// Silence useConversationDetail (not exercised in list mode).
vi.mock("@/hooks/useConversationDetail", () => ({
  useConversationDetail: () => ({
    detail: null, loading: false, error: null,
    markRead: () => {}, latestMessageId: null,
    addOptimistic: () => {}, confirmOptimistic: () => {}, failOptimistic: () => {},
  }),
}));

import MobileMessages from "./MobileMessages";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/inbox"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invoke.mockReset();
  mockUser = { id: "user-1", email: "u@example.com" };
});

describe("MobileMessages", () => {
  it("shows signed-out state when no user", async () => {
    mockUser = null;
    wrap(<MobileMessages />);
    expect(await screen.findByTestId("mobile-messages-signedout")).toBeTruthy();
  });

  it("renders empty state when list is empty", async () => {
    invoke.mockResolvedValueOnce({ data: { conversations: [] }, error: null });
    wrap(<MobileMessages />);
    await waitFor(() => expect(screen.getByTestId("mobile-messages-empty")).toBeTruthy());
  });

  it("renders conversation rows from list", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        conversations: [
          { id: "c1", kind: "booking", status: "open", subject: "Rengøring lørdag", last_message_at: new Date().toISOString(), customer_user_id: "user-1", provider_user_id: "p", updated_at: "" },
          { id: "c2", kind: "support", status: "resolved", subject: null, last_message_at: null, customer_user_id: "user-1", provider_user_id: null, updated_at: "" },
        ],
      },
      error: null,
    });
    wrap(<MobileMessages />);
    expect(await screen.findByText("Rengøring lørdag")).toBeTruthy();
    // Support conversation falls back to translated support title
    expect(screen.getByText("Support")).toBeTruthy();
  });

  it("shows error state with retry", async () => {
    invoke.mockRejectedValueOnce(new Error("boom"));
    wrap(<MobileMessages />);
    const retry = await screen.findByRole("button", { name: /Try again/i });
    invoke.mockResolvedValueOnce({ data: { conversations: [] }, error: null });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId("mobile-messages-empty")).toBeTruthy());
  });

  it("does not leak previous user's conversations across account change", async () => {
    invoke.mockResolvedValueOnce({
      data: { conversations: [{ id: "c1", kind: "booking", status: "open", subject: "Kunde A besked", last_message_at: null, customer_user_id: "user-1", provider_user_id: null, updated_at: "" }] },
      error: null,
    });
    const { rerender } = wrap(<MobileMessages />);
    expect(await screen.findByText("Kunde A besked")).toBeTruthy();

    // Simulate logout: hook clears rows synchronously on user change,
    // then loading state is shown while (unauthenticated) refresh runs.
    mockUser = null;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/inbox"]}><MobileMessages /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Kunde A besked")).toBeNull();
    expect(screen.getByTestId("mobile-messages-signedout")).toBeTruthy();
  });
});
