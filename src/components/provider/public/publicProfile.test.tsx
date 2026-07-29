/**
 * Public provider profile — dynamic data regression tests.
 * Guards against hardcoded mockup content and layout-breaking data shapes.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  deriveAvailabilityStatus,
  derivePresenceStatus,
  haversineKm,
} from "@/hooks/usePublicProviderProfile";
import { deriveTrustBadges } from "./ProviderTrustBadges";
import ProviderHero from "./ProviderHero";
import ProviderServices from "./ProviderServices";
import ProviderExperience from "./ProviderExperience";
import ProviderAbout from "./ProviderAbout";
import ProviderReviews from "./ProviderReviews";
import { formatDistance, serviceLabel } from "./format";
import { activeServices, priceLabel } from "./servicePricing";
import type { PublicProviderProfile } from "./types";

const base: PublicProviderProfile = {
  provider_slug: "x", display_name: "A", avatar_url: null, marketplace_score: null,
  provider_tier: "new", country_code: "DK", city: null, approx_lat: null, approx_lng: null,
  service_categories: [], languages: [], years_experience: null, price_from: null,
  service_radius_km: null, public_bio: null, headline: null, equipment_badges: null,
  avg_response_minutes: null, identity_verified_badge: false, address_verified: false,
  average_rating: null, total_reviews: null, completed_bookings: 0, years_on_platform: 0,
  insurance_valid: false, services: [],
};

describe("availability is calendar-only and never presented as presence", () => {
  it("is unavailable without slots", () => expect(deriveAvailabilityStatus([])).toBe("unavailable"));
  it("is available when any slot exists", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(deriveAvailabilityStatus([{ slot_date: today, slot_hour: 9 }])).toBe("available");
  });
  it("never returns an online value from the calendar", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(deriveAvailabilityStatus([{ slot_date: today, slot_hour: 9 }])).not.toBe("online");
  });
});

describe("presence comes from real platform activity only", () => {
  it("is unknown without presence data", () => expect(derivePresenceStatus(null)).toBe("unknown"));
  it("is online within 10 minutes", () =>
    expect(derivePresenceStatus(new Date(Date.now() - 60_000).toISOString())).toBe("online"));
  it("is unknown after 10 minutes", () =>
    expect(derivePresenceStatus(new Date(Date.now() - 20 * 60_000).toISOString())).toBe("unknown"));
});

describe("hero hides 'Online nu' until presence tracking exists", () => {
  it("shows only availability when presence is unknown", () => {
    render(<ProviderHero profile={base} availabilityStatus="available" distanceKm={null} />);
    expect(screen.getByTestId("provider-availability-status").textContent).toContain("Tilgængelig");
    expect(screen.queryByTestId("provider-presence")).toBeNull();
    expect(screen.queryByText("Online nu")).toBeNull();
  });
  it("shows 'Online nu' alongside availability when presence is real", () => {
    render(
      <ProviderHero profile={base} availabilityStatus="unavailable" presenceStatus="online" distanceKm={null} />,
    );
    expect(screen.getByTestId("provider-presence").textContent).toContain("Online nu");
    expect(screen.getByTestId("provider-availability-status").textContent).toContain("Ikke tilgængelig");
  });
});

describe("distance", () => {
  it("computes real km between coordinates", () => {
    const km = haversineKm({ lat: 55.6761, lng: 12.5683 }, { lat: 55.7, lng: 12.6 });
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(10);
  });
  it("renders nothing when location is unavailable", () => {
    expect(formatDistance(null)).toBeNull();
  });
  it("shows city only when the customer denies location", () => {
    render(<ProviderHero profile={{ ...base, city: "København" }} availabilityStatus="available" distanceKm={null} />);
    expect(screen.getByText("København")).toBeTruthy();
    expect(screen.queryByText(/km væk/)).toBeNull();
  });
});

describe("trust badges only when earned", () => {
  it("hides everything for an unverified provider", () => {
    expect(deriveTrustBadges(base)).toHaveLength(0);
  });
  it("shows only earned badges", () => {
    const badges = deriveTrustBadges({
      ...base,
      identity_verified_badge: true,
      equipment_badges: { mycleaner_test: true, background_check: false },
    });
    expect(badges.map((b) => b.key).sort()).toEqual(["id", "test"]);
  });
});

describe("services render from provider pricing only", () => {
  it("hides the section when the provider has no services", () => {
    const { container } = render(<ProviderServices profile={base} />);
    expect(container.querySelector('[data-testid="provider-services"]')).toBeNull();
  });
  it("renders each service with its own price (legacy fallback shape)", () => {
    render(
      <ProviderServices
        profile={{
          ...base,
          services: [
            { service_code: "cleaning", amount_minor: 29500, currency: "DKK", unit: "hour" },
            { service_code: "moveout_cleaning", amount_minor: 149500, currency: "DKK", unit: "job" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Standardrengøring")).toBeTruthy();
    expect(screen.getByText("Flytterengøring")).toBeTruthy();
    expect(screen.getByText(/295/)).toBeTruthy();
    expect(screen.getByText(/Fra/)).toBeTruthy();
  });
  it("uses provider_service_prices fields when present and hides inactive services", () => {
    render(
      <ProviderServices
        profile={{
          ...base,
          services: [
            {
              service_code: "office_cleaning", amount_minor: 45000, currency: "DKK",
              price_model: "fixed", min_duration_minutes: 120, is_active: true,
              surcharges: [{ label: "Weekend", percent: 25 }],
            },
            {
              service_code: "window_cleaning", amount_minor: 30000, currency: "DKK",
              price_model: "hourly", is_active: false,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Erhvervsrengøring")).toBeTruthy();
    expect(screen.getByText("Min. 2 timer")).toBeTruthy();
    expect(screen.getByText("Weekend +25%")).toBeTruthy();
    expect(screen.queryByText("Vinduespudsning")).toBeNull();
  });
  it("marks legacy rows as fallback pricing so the shim can be removed safely", () => {
    const [legacy] = activeServices([{ service_code: "c", amount_minor: 1000, currency: "DKK", unit: "job" }]);
    expect(legacy.is_fallback_pricing).toBe(true);
    expect(priceLabel(legacy)).toContain("Fra");
    const [real] = activeServices([
      { service_code: "c", amount_minor: 1000, currency: "DKK", price_model: "fixed" },
    ]);
    expect(real.is_fallback_pricing).toBe(false);
    expect(priceLabel(real)).not.toContain("Fra");
  });
  it("labels unknown service codes without crashing", () => {
    expect(serviceLabel("window_polish_xl")).toBe("Window polish xl");
  });
});

describe("experience shows verified employers only", () => {
  it("hides the section without data", () => {
    const { container } = render(<ProviderExperience profile={base} workHistory={[]} />);
    expect(container.querySelector('[data-testid="provider-experience"]')).toBeNull();
  });
  it("renders verified employers and selected languages", () => {
    render(
      <ProviderExperience
        profile={{ ...base, years_experience: 8, languages: ["da", "en"] }}
        workHistory={[{
          company_name: "ISS", role_title: null, city: "København",
          started_on: "2018-01-01", ended_on: "2022-01-01", currently_employed: false,
        }]}
      />,
    );
    expect(screen.getByText(/8 års erfaring/)).toBeTruthy();
    expect(screen.getByText("ISS")).toBeTruthy();
    expect(screen.getByText(/Verificeret/)).toBeTruthy();
    expect(screen.getByText("Dansk · Engelsk")).toBeTruthy();
  });
});

// ── Layout regression: three very different provider shapes ──────────────────

const CASE_A: PublicProviderProfile = {
  ...base, display_name: "Li", city: "Aarhus", provider_tier: "new",
  services: [{ service_code: "cleaning", amount_minor: 25000, currency: "DKK", unit: "hour" }],
};

const CASE_B: PublicProviderProfile = {
  ...base,
  display_name: "Sofia Marquez", city: "København", provider_tier: "top_rated",
  identity_verified_badge: true, address_verified: true, insurance_valid: true,
  equipment_badges: { mycleaner_test: true, background_check: true, professional_certificate: true },
  average_rating: 4.9, total_reviews: 128, completed_bookings: 412, years_experience: 12,
  marketplace_score: 96, languages: ["da", "en", "es", "pl"],
  headline: "Erfaren rengøringsekspert", public_bio: "Jeg har rengjort hjem i København i 12 år.",
  services: [
    { service_code: "cleaning", amount_minor: 29500, currency: "DKK", price_model: "hourly", is_active: true },
    { service_code: "deep_cleaning", amount_minor: 39500, currency: "DKK", price_model: "hourly", is_active: true },
    { service_code: "office_cleaning", amount_minor: 45000, currency: "DKK", price_model: "hourly", is_active: true },
    { service_code: "moveout_cleaning", amount_minor: 149500, currency: "DKK", price_model: "from", is_active: true },
    { service_code: "window_cleaning", amount_minor: 32000, currency: "DKK", price_model: "hourly", is_active: true },
    { service_code: "ironing", amount_minor: 24000, currency: "DKK", price_model: "hourly", is_active: true },
  ],
};

const LONG_NAME = "Alexandra-Katharina von Hohenzollern-Sigmaringen";
const CASE_C: PublicProviderProfile = {
  ...base,
  display_name: LONG_NAME, city: "Frederiksberg", identity_verified_badge: true,
  headline: "Certificeret rengøringsspecialist med fokus på allergivenlig dybderengøring i hele hovedstadsområdet",
  public_bio: "Jeg arbejder grundigt og systematisk. ".repeat(20),
  languages: ["da", "en", "de", "es", "fr", "pl", "ro", "ar", "sv", "no"],
  services: Array.from({ length: 9 }, (_, i) => ({
    service_code: `custom_service_with_a_very_long_code_${i}`,
    amount_minor: 20000 + i * 1000, currency: "DKK", price_model: "hourly" as const, is_active: true,
  })),
};

describe("layout holds for different provider types", () => {
  it("Case A — new provider: minimal data hides optional sections", () => {
    const { container } = render(
      <>
        <ProviderHero profile={CASE_A} availabilityStatus="unavailable" distanceKm={null} />
        <ProviderAbout profile={CASE_A} />
        <ProviderServices profile={CASE_A} />
        <ProviderExperience profile={CASE_A} workHistory={[]} />
        <ProviderReviews profile={CASE_A} reviews={[]} onVisible={() => {}} />
      </>,
    );
    expect(deriveTrustBadges(CASE_A)).toHaveLength(0);
    expect(container.querySelector('[data-testid="provider-experience"]')).toBeNull();
    expect(container.querySelector('[data-testid="provider-reviews"]')).toBeNull();
    expect(within(container.querySelector('[data-testid="provider-services"]') as HTMLElement)
      .getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByTestId("provider-availability-status").textContent).toContain("Ikke tilgængelig");
  });

  it("Case B — experienced provider: every section renders", () => {
    const { container } = render(
      <>
        <ProviderHero profile={CASE_B} availabilityStatus="available" distanceKm={3.2} />
        <ProviderAbout profile={CASE_B} />
        <ProviderServices profile={CASE_B} />
        <ProviderExperience
          profile={CASE_B}
          workHistory={[
            { company_name: "ISS", role_title: "Teamleder", city: "København", started_on: "2018-01-01", ended_on: "2022-01-01", currently_employed: false },
            { company_name: "Coor", role_title: null, city: "København", started_on: "2022-01-01", ended_on: null, currently_employed: true },
          ]}
        />
      </>,
    );
    expect(deriveTrustBadges(CASE_B).length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Top Cleaner")).toBeTruthy();
    expect(screen.getByText(/3\.2 km væk/)).toBeTruthy();
    expect(within(container.querySelector('[data-testid="provider-services"]') as HTMLElement)
      .getAllByRole("heading", { level: 3 })).toHaveLength(6);
    expect(screen.getByText("ISS")).toBeTruthy();
    expect(screen.getByText("Coor")).toBeTruthy();
    expect(screen.getByText("Dansk · Engelsk · Spansk · Polsk")).toBeTruthy();
  });

  it("Case C — long content wraps instead of overflowing", () => {
    const { container } = render(
      <>
        <ProviderHero profile={CASE_C} availabilityStatus="available" distanceKm={12.4} />
        <ProviderAbout profile={CASE_C} />
        <ProviderServices profile={CASE_C} />
      </>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain(LONG_NAME);
    expect(heading.querySelector("span")?.className).toMatch(/break-words/);

    const cards = container.querySelectorAll('[data-testid="provider-services"] article');
    expect(cards).toHaveLength(9);
    cards.forEach((card) => {
      expect(card.className).toMatch(/min-w-0/);
      expect(card.querySelector("h3")?.className).toMatch(/break-words/);
    });

    // Long bios stay inside the card (wrapping, no fixed height / overflow clip).
    const about = container.querySelector('[data-testid="provider-about"]') as HTMLElement;
    expect(about).toBeTruthy();
    expect(about.className).not.toMatch(/overflow-hidden|h-\[/);
  });
});
