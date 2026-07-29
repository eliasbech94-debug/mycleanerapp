/**
 * Auth redesign regression tests.
 *
 * These assert that the *visual* rework preserved every functional
 * contract: fields, legal consent, Turnstile, Google OAuth, submit path
 * and redirect behaviour, plus the no-hamburger rule on auth routes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { isAuthRoute } from "@/components/layout/Header";
import { EARLY_ACCESS_MODE, isBookingLocked } from "@/config/launch";

const signUp = vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null });
const signInWithPassword = vi.fn().mockResolvedValue({ data: {}, error: null });
const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
const invoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null, redirected: true });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...a: unknown[]) => signUp(...a),
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
  },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } },
}));

vi.mock("@/lib/legalAcceptance", () => ({
  fetchActiveRequiredDocs: vi.fn().mockResolvedValue([{ id: "d1", kind: "terms", version: "1.0" }]),
  recordAcceptances: vi.fn().mockResolvedValue(undefined),
}));

let turnstileToken: ((t: string) => void) | null = null;
vi.mock("@/components/Turnstile", () => ({
  __esModule: true,
  default: ({ onToken }: { onToken: (t: string) => void }) => {
    turnstileToken = onToken;
    return <div data-testid="turnstile" />;
  },
  resetTurnstile: () => {},
}));

import Login from "@/pages/Login";

function renderLogin(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  turnstileToken = null;
  window.history.replaceState({}, "", "/login");
});

describe("auth redesign — login", () => {
  it("renders the new login copy and CTA", async () => {
    renderLogin();
    expect(await screen.findByRole("heading", { name: "Velkommen tilbage" })).toBeInTheDocument();
    expect(screen.getByText("Log ind og fortsæt på MyCleaner.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log ind/ })).toBeInTheDocument();
    expect(screen.getByText("Glemt adgangskode?")).toBeInTheDocument();
    expect(screen.getByText("Opret konto")).toBeInTheDocument();
  });

  it("keeps Turnstile integrated and blocks submit without a token", () => {
    renderLogin();
    expect(screen.getByTestId("turnstile")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log ind/ })).toBeDisabled();
  });

  it("keeps the Google OAuth handler", async () => {
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /Fortsæt med Google/ }));
    expect(signInWithOAuth).toHaveBeenCalledWith("google", expect.objectContaining({
      redirect_uri: expect.stringContaining("/auth/callback"),
    }));
  });

  it("submits through captcha-verify then supabase.auth.signInWithPassword", async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "a@b.dk");
    await userEvent.type(screen.getByLabelText("Adgangskode"), "hemmelig1");
    turnstileToken?.("tok");
    const btn = await screen.findByRole("button", { name: /Log ind/ });
    await userEvent.click(btn);
    expect(invoke).toHaveBeenCalledWith("captcha-verify", expect.anything());
    expect(signInWithPassword).toHaveBeenCalled();
  });

  it("password reset still calls resetPasswordForEmail with the reset redirect", async () => {
    renderLogin();
    await userEvent.click(screen.getByText("Glemt adgangskode?"));
    await userEvent.type(screen.getByLabelText("Email"), "a@b.dk");
    turnstileToken?.("tok");
    await userEvent.click(await screen.findByRole("button", { name: /Send gendannelseslink/ }));
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "a@b.dk",
      expect.objectContaining({ redirectTo: expect.stringContaining("/reset-password") }),
    );
  });
});

describe("auth redesign — signup", () => {
  it("renders all required signup fields and copy", async () => {
    renderLogin("/login?mode=signup");
    window.history.replaceState({}, "", "/login?mode=signup");
    renderLogin();
    const heading = await screen.findAllByRole("heading", { name: "Opret din MyCleaner-konto" });
    expect(heading.length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Fulde navn").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Email").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Adgangskode").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Land").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("auth-trust-note").length).toBeGreaterThan(0);
  });

  it("still requires legal consent and shows the document version", async () => {
    window.history.replaceState({}, "", "/login?mode=signup");
    renderLogin();
    const consent = await screen.findByText(/Jeg accepterer/);
    expect(consent).toBeInTheDocument();
    expect(await screen.findByText("terms@1.0")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeRequired();
    turnstileToken?.("tok");
    expect(screen.getByRole("button", { name: /Opret konto/ })).toBeDisabled();
  });

  it("shows a password show/hide toggle", async () => {
    window.history.replaceState({}, "", "/login?mode=signup");
    renderLogin();
    expect(await screen.findByRole("button", { name: "Vis adgangskode" })).toBeInTheDocument();
  });
});

describe("auth redesign — surface rules", () => {
  it("hides the global header (and hamburger) on auth routes", () => {
    expect(isAuthRoute("/login")).toBe(true);
    expect(isAuthRoute("/reset-password")).toBe(true);
    expect(isAuthRoute("/customer/register")).toBe(true);
    expect(isAuthRoute("/marketplace")).toBe(false);
  });

  it("shows only the small Early Access chip, not the launch banner", async () => {
    renderLogin();
    expect(await screen.findByTestId("auth-early-access-chip")).toBeInTheDocument();
    expect(screen.queryByTestId("early-access-banner")).toBeNull();
  });

  it("Early Access keeps signup open while booking stays locked", () => {
    expect(EARLY_ACCESS_MODE).toBe(true);
    expect(isBookingLocked()).toBe(true);
  });

  it("introduces no booking or payment action on auth pages", async () => {
    renderLogin();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/\/book(ing)?\b/);
    expect(html).not.toMatch(/checkout|payment-create-intent/i);
  });
});
