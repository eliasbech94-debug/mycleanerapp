/**
 * Founding Cleaner — Mobile CampaignSection card
 *
 * Verifies the premium mobile invitation card:
 *  - renders "0 KR." (or locale amount), "3 måneder", "FØRSTE 500", and mentions 2026
 *  - CTA linkes til /founding-cleaner
 *  - only one interactive link wraps the whole card (no nested buttons/links)
 *  - decorative elements are aria-hidden
 *  - no forbidden claims (livstid, gratis, ingen gebyrer, 100 %) render
 *  - no countdown / remaining-seats copy renders
 */
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { CampaignSection } from "@/components/marketplace/home/CampaignSection";

import da from "../../../../public/locales/da/marketplace.json";
import en from "../../../../public/locales/en/marketplace.json";
import sv from "../../../../public/locales/sv/marketplace.json";
import es from "../../../../public/locales/es/marketplace.json";

function setup(lang: "da" | "en" | "sv" | "es") {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      lng: lang,
      fallbackLng: "en",
      resources: {
        da: { marketplace: da },
        en: { marketplace: en },
        sv: { marketplace: sv },
        es: { marketplace: es },
      },
      interpolation: { escapeValue: false },
    });
  } else {
    i18n.changeLanguage(lang);
  }
  return render(
    <MemoryRouter>
      <CampaignSection />
    </MemoryRouter>,
  );
}

describe("CampaignSection — mobile Founding Cleaner card", () => {
  it("renders headline copy (DA): 0 KR., 3 måneder, FØRSTE 500, 2026 explain", () => {
    const { getByTestId, getAllByText, container } = setup("da");
    const card = getByTestId("founding-cleaner-card-mobile");
    const scoped = within(card);
    expect(scoped.getByText("0 KR.")).toBeInTheDocument();
    expect(scoped.getByText(/3 måneder/i)).toBeInTheDocument();
    expect(scoped.getByText(/FØRSTE 500/i)).toBeInTheDocument();
    expect(getAllByText(/2026/).length).toBeGreaterThan(0);
    // Ensure no horizontal-scroll-inducing overflow classes are present at root
    expect(container.querySelector("[data-testid=founding-cleaner-card-mobile]")).toHaveClass("overflow-hidden");
  });

  it("CTA link targets /founding-cleaner and is the single interactive area", () => {
    const { getByTestId } = setup("da");
    const card = getByTestId("founding-cleaner-card-mobile") as HTMLAnchorElement;
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/founding-cleaner");
    // No nested links or buttons inside the card
    expect(card.querySelectorAll("a").length).toBe(0);
    expect(card.querySelectorAll("button").length).toBe(0);
  });

  it("decorative visuals are aria-hidden", () => {
    const { getByTestId } = setup("da");
    const card = getByTestId("founding-cleaner-card-mobile");
    // The sparkle/halo container is explicitly aria-hidden
    const hidden = card.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("does not render forbidden claims or countdown / remaining-seats copy", () => {
    for (const lang of ["da", "en", "sv", "es"] as const) {
      const { getByTestId, unmount } = setup(lang);
      const text = getByTestId("founding-cleaner-card-mobile").textContent?.toLowerCase() ?? "";
      for (const bad of [
        "livstid",
        "lifetime",
        "vitalicio",
        "gratis",
        "free",
        "ingen gebyrer",
        "no fees",
        "sin comisiones",
        "100 %",
        "100%",
        "pladser tilbage",
        "seats left",
        "plazas restantes",
        "platser kvar",
        "countdown",
      ]) {
        expect(text, `forbidden phrase "${bad}" found in ${lang}`).not.toContain(bad);
      }
      unmount();
    }
  });
});
