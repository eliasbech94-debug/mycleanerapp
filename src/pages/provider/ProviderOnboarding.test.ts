import { describe, it, expect } from "vitest";
import { computeStepCompletion } from "@/pages/provider/ProviderOnboarding";

const basePp: any = {
  status: "draft",
  completion_pct: 0,
  display_name: null,
  date_of_birth: null,
  photo_path: null,
  base_address_place_id: null,
  bio: null,
  service_categories: [],
  languages: [],
  hourly_rate: null,
  service_area_radius_km: null,
  identity_status: "not_started",
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  terms_accepted_at: null,
};

describe("computeStepCompletion", () => {
  it("returns all false for empty applicant", () => {
    const c = computeStepCompletion(basePp, {}, { id: "u1" });
    // Account is true (user exists), everything else false
    expect(c).toEqual([true, false, false, false, false, false]);
  });

  it("marks basic complete when required fields are set", () => {
    const c = computeStepCompletion(
      { ...basePp, display_name: "Anna", date_of_birth: "1990-01-01", base_address_place_id: "pid", photo_path: "p" },
      { full_name: "Anna", phone: "+4522334455" },
      { id: "u1" },
    );
    expect(c[1]).toBe(true);
  });

  it("marks identity complete only when verified + email confirmed", () => {
    const c = computeStepCompletion(
      { ...basePp, identity_status: "verified" },
      {},
      { id: "u1", email_confirmed_at: "2026-01-01" },
    );
    expect(c[3]).toBe(true);
  });

  it("marks stripe complete only with terms accepted", () => {
    const missingTerms = computeStepCompletion(
      { ...basePp, stripe_charges_enabled: true, stripe_payouts_enabled: true },
      {}, { id: "u1" },
    );
    const complete = computeStepCompletion(
      { ...basePp, stripe_charges_enabled: true, stripe_payouts_enabled: true, terms_accepted_at: "now" },
      {}, { id: "u1" },
    );
    expect(missingTerms[4]).toBe(false);
    expect(complete[4]).toBe(true);
  });

  it("review remains incomplete while status is draft/pending_stripe", () => {
    expect(computeStepCompletion(basePp, {}, { id: "u1" })[5]).toBe(false);
    expect(computeStepCompletion({ ...basePp, status: "pending_stripe" }, {}, { id: "u1" })[5]).toBe(false);
    expect(computeStepCompletion({ ...basePp, status: "pending_review" }, {}, { id: "u1" })[5]).toBe(true);
    expect(computeStepCompletion({ ...basePp, status: "active" }, {}, { id: "u1" })[5]).toBe(true);
  });
});
