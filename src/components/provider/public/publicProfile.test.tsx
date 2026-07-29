/**
 * Public provider profile — dynamic data regression tests.
 * Guards against hardcoded mockup content and layout-breaking data shapes.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { deriveOnlineStatus, haversineKm } from "@/hooks/usePublicProviderProfile";
import { deriveTrustBadges } from "./ProviderTrustBadges";
import ProviderServices from "./ProviderServices";
import ProviderExperience from "./ProviderExperience";
import { formatDistance, serviceLabel, servicePriceLabel } from "./format";
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

describe("online status derives from real availability", () => {
  it("offline without slots", () => expect(deriveOnlineStatus([])).toBe("offline"));
  it("online when a slot exists today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(deriveOnlineStatus([{ slot_date: today, slot_hour: 9 }])).toBe("online");
  });
  it("busy when the next slot is a few days out", () => {
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    expect(deriveOnlineStatus([{ slot_date: d, slot_hour: 9 }])).toBe("busy");
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

describe("services render from provider data only", () => {
  it("hides the section when the provider has no services", () => {
    const { container } = render(<ProviderServices profile={base} />);
    expect(container.querySelector('[data-testid="provider-services"]')).toBeNull();
  });
  it("renders each enabled service with its own price", () => {
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
  it("labels unknown service codes without crashing", () => {
    expect(serviceLabel("window_polish_xl")).toBe("Window polish xl");
    expect(servicePriceLabel({ service_code: "c", amount_minor: 1000, currency: "EUR" })).toContain("/time");
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
