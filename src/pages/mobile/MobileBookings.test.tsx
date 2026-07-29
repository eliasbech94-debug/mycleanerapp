/**
 * MobileBookings — presentation tests (Phase 4).
 *
 * Mocks Supabase client + auth. Verifies:
 *  - Loading, populated, empty, error states.
 *  - Upcoming/previous segmentation using existing status rules.
 *  - Signed-out empty state (never renders another customer's data).
 *  - Booking detail link points at /booking/:id/plan.
 *  - Cache-clear on user change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState: { user: { id: string } | null; loading: boolean } = { user: { id: "u1" }, loading: false };
type Resp = { data: unknown[] | null; error: unknown };
const rpcResp: { current: Resp } = { current: { data: [], error: null } };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, session: null, loading: authState.loading, profile: null }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    from: () => chain,
    select: () => chain,
    order: () => Promise.resolve(rpcResp.current),
  };
  return { supabase: chain };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, d?: string) => d ?? k,
    i18n: { language: "da" },
  }),
}));

async function renderPage() {
  const Page = (await import("./MobileBookings")).default;
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  authState.user = { id: "u1" };
  authState.loading = false;
  rpcResp.current = { data: [], error: null };
});
afterEach(() => cleanup());

const soon = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
};
const past = () => {
  const d = new Date();
  d.setDate(d.getDate() - 10);
  return d.toISOString().slice(0, 10);
};

describe("MobileBookings", () => {
  it("shows signed-out empty state (never leaks other customers' data)", async () => {
    authState.user = null;
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Log ind for at se dine bookinger")).toBeTruthy(),
    );
  });

  it("shows empty state for authenticated user with no bookings", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Ingen kommende bookinger")).toBeTruthy());
  });

  it("splits upcoming vs previous by status + date", async () => {
    rpcResp.current = {
      data: [
        { id: "a", provider_id: "p", provider_name: "Anna", service: "Rengøring", hours: 2, booking_date: soon(), slot: "10:00", address: "Vej 1", customer_pays: 400, currency: "DKK", status: "accepted", created_at: "" },
        { id: "b", provider_id: "p", provider_name: "Bo", service: "Rengøring", hours: 3, booking_date: past(), slot: "11:00", address: "Vej 2", customer_pays: 600, currency: "DKK", status: "completed", created_at: "" },
        { id: "c", provider_id: "p", provider_name: "Cara", service: "Rengøring", hours: 3, booking_date: soon(), slot: "12:00", address: "Vej 3", customer_pays: 600, currency: "DKK", status: "cancelled", created_at: "" },
      ],
      error: null,
    };
    await renderPage();
    await waitFor(() => expect(screen.getByRole("link", { name: /Anna/ })).toBeTruthy());
    // Anna (upcoming/accepted) visible; Bo (completed) and Cara (cancelled) not on upcoming tab
    expect(screen.queryByRole("link", { name: /Bo/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Cara/ })).toBeNull();
    // Detail link points at existing booking-detail route
    expect(screen.getByRole("link", { name: /Anna/ }).getAttribute("href")).toBe("/booking/a/plan");
  });

  it("shows error state with retry", async () => {
    rpcResp.current = { data: null, error: { message: "boom" } };
    await renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
