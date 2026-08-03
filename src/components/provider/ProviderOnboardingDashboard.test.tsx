import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProviderOnboardingDashboard } from "./ProviderOnboardingDashboard";
import { deriveProviderActivation } from "@/lib/provider/activation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const renderFor = (status: string) =>
  render(
    <MemoryRouter>
      <ProviderOnboardingDashboard
        activation={deriveProviderActivation({
          status,
          identity_status: "pending",
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          completion_pct: 50,
        })}
      />
    </MemoryRouter>,
  );

describe("ProviderOnboardingDashboard", () => {
  it("shows the current activation status", () => {
    renderFor("pending_review");
    expect(screen.getByTestId("provider-activation-status").textContent).toBe(
      "activation.states.pending_review.title",
    );
  });

  it("renders only onboarding actions — no booking or finance operations", () => {
    renderFor("pending_identity");
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toMatch(/booking|bookings|requests|customers|payout|bilag|pricing/i);
    }
  });

  it("renders no disabled or dead action buttons", () => {
    renderFor("suspended");
    expect(document.querySelectorAll("button[disabled]")).toHaveLength(0);
    for (const a of Array.from(document.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).toBeTruthy();
    }
  });

  it("states clearly that operational features are locked", () => {
    renderFor("pending_stripe");
    expect(screen.getByText("activation.lockedDescription")).toBeTruthy();
  });
});
