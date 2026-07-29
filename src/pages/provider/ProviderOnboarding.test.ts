import { describe, it, expect } from "vitest";
import {
  computeStepCompletion,
  computeStepCompletionByKey,
  ONBOARDING_STEP_KEYS,
  ONBOARDING_STEP_LABELS,
  SUBMIT_ERROR_MESSAGES,
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
  base_postal_code: null,
  base_country_code: null,
  headline: null,
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
  stripe_details_submitted: false,
  terms_accepted_at: null,
};

const baseUser: any = { id: "u1" };

const completeBasic = {
  display_name: "Anna",
  date_of_birth: "1990-01-01",
  photo_path: "p",
  base_address_place_id: "pid",
  base_postal_code: "1000",
  base_country_code: "DK",
};
const completeBasicProfile = { full_name: "Anna", phone: "+4522334455" };
const completeService = {
  service_categories: ["cleaning"],
  headline: "Erfaren cleaner i København",
  bio: "Erfaren cleaner med fokus på kvalitet og grundighed hver eneste gang.",
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
  stripe_details_submitted: true,
  terms_accepted_at: "2026-01-01",
};

const fullyCompleteOpts = {
  hasActiveServicePrice: true,
  smsVerifiedAt: "2026-01-01T00:00:00Z",
};

function fullyComplete(status = "active") {
  return computeStepCompletionByKey(
    {
      ...basePp,
      ...completeBasic,
      ...completeService,
      ...completeInsurance,
      ...completeStripe,
      identity_status: "approved",
      status,
    },
    completeBasicProfile,
    { ...baseUser, email_confirmed_at: "2026-01-01" },
    fullyCompleteOpts,
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

  it("exposes Danish labels for every step", () => {
    for (const k of ONBOARDING_STEP_KEYS) {
      expect(ONBOARDING_STEP_LABELS[k].length).toBeGreaterThan(0);
    }
    expect(SUBMIT_ERROR_MESSAGES.requirements_incomplete).toMatch(/mangler/i);
    expect(SUBMIT_ERROR_MESSAGES.provider_underage).toMatch(/18 år/);
  });
});

describe("computeStepCompletionByKey — empty applicant", () => {
  it("only account is complete; every other step is incomplete", () => {
    const c = computeStepCompletionByKey(basePp, {}, baseUser);
    expect(c.account).toBe(true);
    expect(
      ONBOARDING_STEP_KEYS.filter((k) => !c[k]),
    ).toEqual(["basic", "service", "insurance", "identity", "stripe", "review"]);
  });

  it("without a user, account itself is incomplete", () => {
    const c = computeStepCompletionByKey(basePp, {}, null);
    expect(c.account).toBe(false);
  });
});

describe("computeStepCompletionByKey — basic", () => {
  it("completes when all identity, phone, address & photo fields are filled and provider is 18+", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeBasic },
      completeBasicProfile,
      baseUser,
    );
    expect(c.basic).toBe(true);
  });

  it("under 18 → basic INCOMPLETE (age is client-mirrored from backend)", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 17);
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeBasic, date_of_birth: dob.toISOString().slice(0, 10) },
      completeBasicProfile,
      baseUser,
    );
    expect(c.basic).toBe(false);
  });

  it("missing display_name → basic INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeBasic, display_name: null },
      completeBasicProfile,
      baseUser,
    );
    expect(c.basic).toBe(false);
  });

  it("missing validated postal code → basic INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeBasic, base_postal_code: null },
      completeBasicProfile,
      baseUser,
    );
    expect(c.basic).toBe(false);
  });
});

describe("computeStepCompletionByKey — service", () => {
  it("bio under 40 chars → service INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeService, bio: "kort bio" },
      {},
      baseUser,
      { hasActiveServicePrice: true },
    );
    expect(c.service).toBe(false);
  });

  it("missing headline → service INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeService, headline: null },
      {},
      baseUser,
      { hasActiveServicePrice: true },
    );
    expect(c.service).toBe(false);
  });

  it("no saved active service price → service INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeService },
      {},
      baseUser,
      { hasActiveServicePrice: false },
    );
    expect(c.service).toBe(false);
  });

  it("all service fields + at least one saved active price → service COMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeService },
      {},
      baseUser,
      { hasActiveServicePrice: true },
    );
    expect(c.service).toBe(true);
  });
});

describe("computeStepCompletionByKey — insurance", () => {
  it("requires policy number, doc, and non-expired date", () => {
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
  const user = { ...baseUser, email_confirmed_at: "2026-01-01" };

  it("requires identity_status === 'approved' AND email confirmed AND SMS-verified", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "approved" },
      {},
      user,
      { smsVerifiedAt: "2026-01-01" },
    );
    expect(c.identity).toBe(true);
  });

  it("identity_status = 'verified' is NOT enough (backend accepts only 'approved')", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "verified" },
      {},
      user,
      { smsVerifiedAt: "2026-01-01" },
    );
    expect(c.identity).toBe(false);
  });

  it("phone not SMS-verified → identity INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "approved" },
      {},
      user,
      { smsVerifiedAt: null },
    );
    expect(c.identity).toBe(false);
  });

  it("email confirmed but identity NOT approved → INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, identity_status: "pending" },
      {},
      user,
      { smsVerifiedAt: "2026-01-01" },
    );
    expect(c.identity).toBe(false);
  });
});

describe("computeStepCompletionByKey — stripe", () => {
  it("charges + payouts + details_submitted + terms all required", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeStripe },
      {},
      baseUser,
    );
    expect(c.stripe).toBe(true);
  });

  it("details_submitted = false → stripe INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeStripe, stripe_details_submitted: false },
      {},
      baseUser,
    );
    expect(c.stripe).toBe(false);
  });

  it("terms not accepted → stripe INCOMPLETE", () => {
    const c = computeStepCompletionByKey(
      { ...basePp, ...completeStripe, terms_accepted_at: null },
      {},
      baseUser,
    );
    expect(c.stripe).toBe(false);
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

  it("is INCOMPLETE for rejected, suspended and unknown statuses (fail closed)", () => {
    expect(check("rejected")).toBe(false);
    expect(check("suspended")).toBe(false);
    expect(check("something_new")).toBe(false);
    expect(check("")).toBe(false);
  });
});

describe("computeStepCompletionByKey — end-to-end", () => {
  it("fully completed applicant with active status → every step true", () => {
    const c = fullyComplete("active");
    for (const k of ONBOARDING_STEP_KEYS) expect(c[k]).toBe(true);
  });

  it("deactivating the only saved service price → onboarding is NOT complete", () => {
    const c = computeStepCompletionByKey(
      {
        ...basePp,
        ...completeBasic,
        ...completeService,
        ...completeInsurance,
        ...completeStripe,
        identity_status: "approved",
        status: "draft",
      },
      completeBasicProfile,
      { ...baseUser, email_confirmed_at: "2026-01-01" },
      { hasActiveServicePrice: false, smsVerifiedAt: "2026-01-01" },
    );
    expect(c.service).toBe(false);
  });

  it("fully completed but rejected → review is NOT complete", () => {
    const c = fullyComplete("rejected");
    expect(c.review).toBe(false);
    expect(ONBOARDING_STEP_KEYS.every((k: OnboardingStepKey) => c[k])).toBe(false);
  });
});
