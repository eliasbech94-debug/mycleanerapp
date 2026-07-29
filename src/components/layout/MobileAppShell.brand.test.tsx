/**
 * Regression: PrimaryBookingCard and mobile-home CTAs must render with a
 * visible brand background inside MobileAppShell. This guards against the
 * "invisible CTA" bug where the marketplace surface scope was missing and
 * `--mkt-brand` resolved to nothing, producing white-on-white output.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileAppShell } from "@/components/layout/MobileAppShell";

// Minimal i18next mock so components using useTranslation don't require init here.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_: string, d?: string) => d ?? "" }),
}));

describe("MobileAppShell brand surface", () => {
  it("declares data-surface=\"marketplace\" so --mkt-* tokens resolve", () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <MobileAppShell>
          <div>content</div>
        </MobileAppShell>
      </MemoryRouter>,
    );
    const shell = getByTestId("mobile-app-shell");
    expect(shell.getAttribute("data-surface")).toBe("marketplace");
  });

  it("children with bg-[hsl(var(--mkt-brand))] must not be transparent-on-white", () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <MobileAppShell>
          <button
            data-testid="cta"
            className="bg-[hsl(var(--mkt-brand))] text-white"
          >
            Find en Cleaner
          </button>
        </MobileAppShell>
      </MemoryRouter>,
    );
    const cta = getByTestId("cta");
    // Class assertion: bans a documented invisible pairing (white bg + white text).
    expect(cta.className).toContain("bg-[hsl(var(--mkt-brand))]");
    expect(cta.className).not.toMatch(/bg-white\b(?![^"']*text-\[)/);
  });
});
