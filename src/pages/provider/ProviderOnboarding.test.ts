import { describe, it, expect } from "vitest";
import {
  computeStepCompletion,
  computeStepCompletionByKey,
  ONBOARDING_STEP_KEYS,
  type OnboardingStepKey,
} from "@/pages/provider/ProviderOnboarding";

const validInsuranceDate = "2099-12-31";

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
  insurance_policy_number: null,
  insurance_doc_path: null,
  insurance_expires_on: null,
  identity_status: "not_started",
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  terms_accepted_at: null,
};

const baseUser: any = { id: "u1" };

const completeBasic = {
  display_name: "Anna",
  date_of_birth: "1990-01-01",
  photo_path: "p",
  base_address_place_id: "pid",
};
const completeBasicProfile = { full_name: "Anna", phone: "+4522334455" };
const completeService = {
  service_categories: ["cleaning"],
  bio: "Erfaren cleaner med fokus på kvalitet.",
  languages: ["da"],
  service_area_radius_km: 20,
};
const completeInsurance = {
  insurance_policy_number: "POL-1",
  insurance_doc_path: "doc",
  insurance_expires_on: validInsuranceDate,
};
const completeStripe = {
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  terms_accepted_at: "2026-01-01",
};

function fullyComplete(status = "active") {
  return computeStepCompletionByKey(
    {
      ...basePp,
      ...completeBasic,
      ...completeService,
      ...completeInsurance,
      ...completeStripe,
      identity_status: "verified",
      status,
    },
    completeBasicProfile,
    { ...baseUser, email_confirmed_at: "2026-01-01" },
  );
}

describe("computeStepCompletionByKey — shape", () => {
  it("returns seven keyed entries in stable named order", () => {
    const c = computeStepCompletionByKey(basePp, {}, baseUser);
    expect(Object.keys(c).sort()).toEqual([...ONBOARDING_STEP_KEYS].sort());
    expect(ONBOARDING_STEP_KEYS).toEqual([
      "account",
      "basic",
      "service",
      "insurance",
      "identity",
      "stripe",
      "review",
    ]);
  });

  it("array export mirrors the keyed export in declared order", () => {
    const keyed = computeStepCompletionByKey(basePp, {}, baseUser);
    const arr = computeStepCompletion(basePp, {}, baseUser);
    expect(arr).toEqual(ONBOARDING_STEP_KEYS.map((k) => keyed[k]));
    expect(arr).toHaveLength(7);
  });
});

describe("computeStepCompletionByKey — empty applicant", () => {
  it("only account is complete; every other step is incomplete", () => {
    const c = computeStepCompletionByKey(basePp, {}, baseUser);
    const incomplete = ONBOARDING_STEP_KEYS.filter((k) => !c[k]);
    expect(c.account).toBe(true);
    expect(incomplete).toEqual([
      "basic",
      "service",
      "insurance",
      "identity",
      "stripe",
      "review",
    ]);
  });

  it("without a user, account itself is incomplete", () => {
    const c = computeStepCompletionByKey(basePp, {}, null);
    expect(c.account).toBe(false);
  });
});

describe("computeStepCompletionByKey — per-step completion", () => {
  it("basic completes only when name, dob, phone, address and photo are set", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeBasic },
      completeBasicProfile,
      baseUser,
    );
    expect(c.basic).toBe(true);
    const missingPhone = computeStepCompletionByKey(
      { ...basePp, ...completeBasic },
      { full_name: "Anna" },
      baseUser,
    );
    expect(missingPhone.basic).toBe(false);
  });

  it("service completes when categories, bio(>=20), languages and radius are set; prices are server validated", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeService },
      {},
      baseUser,
    );
    expect(c.service).toBe(true);
    const shortBio = computeStepCompletionByKey(
      { ...basePp, ...completeService, bio: "short" },
      {},
      baseUser,
    );
    expect(shortBio.service).toBe(false);
  });

  it("insurance requires policy number, doc, and non-expired date", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeInsurance },
      {},
      baseUser,
    );
    expect(c.insurance).toBe(true);
    const expired = computeStepCompletionByKey(
      { ...basePp, ...completeInsurance, insurance_expires_on: "2000-01-01" },
      {},
      baseUser,
    );
    expect(expired.insurance).toBe(false);
  });
});

describe("computeStepCompletionByKey — identity", () => {
  it("identity requires verification AND confirmed email", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "verified" },
      {},
      { ...baseUser, email_confirmed_at: "2026-01-01" },
    );
    expect(c.identity).toBe(true);
  });

  it("identity verified but email unconfirmed → incomplete", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "verified" },
      {},
      baseUser,
    );
    expect(c.identity).toBe(false);
  });

  it("email confirmed but identity unverified → incomplete", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "pending" },
      {},
      { ...baseUser, email_confirmed_at: "2026-01-01" },
    );
    expect(c.identity).toBe(false);
  });
});

describe("computeStepCompletionByKey — stripe", () => {
  it("stripe submitted without accepted terms → incomplete", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, stripe_charges_enabled: true, stripe_payouts_enabled: true },
      {},
      baseUser,
    );
    expect(c.stripe).toBe(false);
  });

  it("terms accepted without completed Stripe onboarding → incomplete", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, terms_accepted_at: "2026-01-01" },
      {},
      baseUser,
    );
    expect(c.stripe).toBe(false);
  });

  it("stripe complete only when charges, payouts and terms are all satisfied", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeStripe },
      {},
      baseUser,
    );
    expect(c.stripe).toBe(true);
  });
});

describe("computeStepCompletionByKey — review by status", () => {
  const check = (status: string) =>
    computeStepCompletionByKey({ ...basePp, status }, {}, baseUser).review;

  it("is incomplete for draft, pending_identity and pending_stripe", () => {
    expect(check("draft")).toBe(false);
    expect(check("pending_identity")).toBe(false);
    expect(check("pending_stripe")).toBe(false);
  });

  it("is complete for pending_review and active", () => {
    expect(check("pending_review")).toBe(true);
    expect(check("active")).toBe(true);
  });

  it("is INCOMPLETE for rejected and suspended (fail closed)", () => {
    expect(check("rejected")).toBe(false);
    expect(check("suspended")).toBe(false);
  });

  it("is INCOMPLETE for unknown/future statuses (fail closed)", () => {
    expect(check("something_new")).toBe(false);
    expect(check("")).toBe(false);
  });
});

describe("computeStepCompletionByKey — end-to-end", () => {
  it("fully completed applicant with active status → every step true", () => {
    const c = fullyComplete("active");
    for (const k of ONBOARDING_STEP_KEYS) expect(c[k]).toBe(true);
  });

  it("fully completed but rejected → onboarding is NOT complete", () => {
    const c = fullyComplete("rejected");
    expect(c.review).toBe(false);
    expect(ONBOARDING_STEP_KEYS.every((k: OnboardingStepKey) => c[k])).toBe(false);
  });

  it("fully completed but suspended → onboarding is NOT complete", () => {
    const c = fullyComplete("suspended");
    expect(c.review).toBe(false);
  });
});
