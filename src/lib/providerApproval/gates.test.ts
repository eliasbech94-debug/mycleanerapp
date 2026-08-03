import { describe, it, expect } from "vitest";
import {
  evaluateGates,
  decideApprovalState,
  mapSumsubReview,
  type GateInput,
} from "./gates";

const NOW = new Date("2026-02-01T12:00:00.000Z");

const green: GateInput = {
  identityStatus: "approved",
  sumsubReviewStatus: "completed",
  sumsubReviewAnswer: "GREEN",
  identitySandbox: false,
  production: true,
  photoPath: "u/1/photo.jpg",
  photoModerationStatus: "approved",
  displayName: "Anna Jensen",
  headline: "Erfaren cleaner i København",
  bio: "Jeg har rengjort private hjem i mere end fem år og elsker et grundigt resultat.",
  dateOfBirth: "1990-05-04",
  languages: ["da", "en"],
  baseAddressPlaceId: "place_123",
  baseCountryCode: "DK",
  smsVerifiedAt: "2026-01-01T00:00:00Z",
  emailConfirmedAt: "2026-01-01T00:00:00Z",
  termsAcceptedAt: "2026-01-01T00:00:00Z",
  activeServiceRates: [22000],
  countryMinRateMinor: 19000,
  quizPassedAt: "2026-01-02T00:00:00Z",
  insuranceDocPath: "u/1/insurance.pdf",
  insurancePolicyNumber: "POL-1",
  insuranceExpiresOn: "2027-01-01",
  stripeDetailsSubmitted: true,
  stripePayoutsEnabled: true,
  stripeChargesEnabled: true,
  stripeRequirementsDue: [],
  payoutFrozen: false,
};

describe("evaluateGates — happy path", () => {
  it("passes every gate", () => {
    const g = evaluateGates(green, NOW);
    expect(g.allGreen).toBe(true);
    expect(g.missing).toEqual([]);
    expect(decideApprovalState(g)).toEqual({
      state: "approved",
      isPublic: true,
      isBookable: true,
    });
  });
});

describe("identity gate", () => {
  it("rejects a sandbox result in production", () => {
    const g = evaluateGates({ ...green, identitySandbox: true }, NOW);
    expect(g.identity).toBe(false);
    expect(decideApprovalState(g).state).toBe("awaiting_identity");
  });

  it("accepts a sandbox result outside production", () => {
    const g = evaluateGates({ ...green, identitySandbox: true, production: false }, NOW);
    expect(g.identity).toBe(true);
  });

  it("rejects GREEN when review is not completed", () => {
    const g = evaluateGates({ ...green, sumsubReviewStatus: "pending" }, NOW);
    expect(g.identity).toBe(false);
  });

  it("rejects completed but non-GREEN", () => {
    const g = evaluateGates({ ...green, sumsubReviewAnswer: "RED" }, NOW);
    expect(g.identity).toBe(false);
  });

  it("treats unknown identity provenance as not approved", () => {
    const g = evaluateGates({ ...green, identitySandbox: null }, NOW);
    expect(g.identity).toBe(false);
  });

  it("reports identity_in_review while pending", () => {
    const g = evaluateGates(
      { ...green, identityStatus: "pending", sumsubReviewStatus: "pending" },
      NOW,
    );
    expect(decideApprovalState(g).state).toBe("identity_in_review");
  });
});

describe("photo gate", () => {
  it("blocks when there is no photo", () => {
    const g = evaluateGates({ ...green, photoPath: null, photoModerationStatus: null }, NOW);
    expect(g.photo).toBe(false);
    expect(decideApprovalState(g).state).toBe("awaiting_profile_photo");
  });

  it("blocks while moderation is pending", () => {
    const g = evaluateGates({ ...green, photoModerationStatus: "pending" }, NOW);
    expect(decideApprovalState(g).state).toBe("photo_in_review");
  });

  it("blocks on manual_review", () => {
    const g = evaluateGates({ ...green, photoModerationStatus: "manual_review" }, NOW);
    expect(g.photo).toBe(false);
    expect(g.photoInReview).toBe(true);
  });

  it("blocks on rejected", () => {
    const g = evaluateGates({ ...green, photoModerationStatus: "rejected" }, NOW);
    expect(g.photo).toBe(false);
    expect(g.photoInReview).toBe(false);
  });
});

describe("profile gate", () => {
  it("requires a bio of at least 40 characters", () => {
    const g = evaluateGates({ ...green, bio: "For kort bio" }, NOW);
    expect(g.profile).toBe(false);
    expect(decideApprovalState(g).state).toBe("awaiting_profile_completion");
  });

  it("requires the provider to be 18+", () => {
    const g = evaluateGates({ ...green, dateOfBirth: "2010-01-01" }, NOW);
    expect(g.profile).toBe(false);
  });

  it("accepts someone who just turned 18", () => {
    const g = evaluateGates({ ...green, dateOfBirth: "2008-02-01" }, NOW);
    expect(g.profile).toBe(true);
  });

  it("requires verified phone and email", () => {
    expect(evaluateGates({ ...green, smsVerifiedAt: null }, NOW).profile).toBe(false);
    expect(evaluateGates({ ...green, emailConfirmedAt: null }, NOW).profile).toBe(false);
  });

  it("requires a validated address and country", () => {
    expect(evaluateGates({ ...green, baseAddressPlaceId: null }, NOW).profile).toBe(false);
    expect(evaluateGates({ ...green, baseCountryCode: null }, NOW).profile).toBe(false);
  });
});

describe("services gate", () => {
  it("blocks a rate below the country minimum", () => {
    const g = evaluateGates({ ...green, activeServiceRates: [15000] }, NOW);
    expect(g.services).toBe(false);
  });

  it("accepts a rate exactly at the minimum", () => {
    const g = evaluateGates({ ...green, activeServiceRates: [19000] }, NOW);
    expect(g.services).toBe(true);
  });

  it("blocks when the country minimum is unknown", () => {
    const g = evaluateGates({ ...green, countryMinRateMinor: null }, NOW);
    expect(g.services).toBe(false);
  });

  it("blocks with no active services", () => {
    expect(evaluateGates({ ...green, activeServiceRates: [] }, NOW).services).toBe(false);
  });
});

describe("quiz and documents gates", () => {
  it("blocks until the quiz is passed", () => {
    const g = evaluateGates({ ...green, quizPassedAt: null }, NOW);
    expect(g.quiz).toBe(false);
    expect(decideApprovalState(g).state).toBe("awaiting_profile_completion");
  });

  it("blocks on expired insurance", () => {
    const g = evaluateGates({ ...green, insuranceExpiresOn: "2025-01-01" }, NOW);
    expect(g.documents).toBe(false);
    expect(decideApprovalState(g).state).toBe("awaiting_documents");
  });

  it("blocks without an insurance document", () => {
    expect(evaluateGates({ ...green, insuranceDocPath: null }, NOW).documents).toBe(false);
  });
});

describe("stripe gate", () => {
  it("blocks on outstanding requirements", () => {
    const g = evaluateGates(
      { ...green, stripeRequirementsDue: ["individual.id_number"] },
      NOW,
    );
    expect(g.stripe).toBe(false);
    expect(decideApprovalState(g).state).toBe("awaiting_stripe");
  });

  it("blocks when payouts are disabled", () => {
    expect(evaluateGates({ ...green, stripePayoutsEnabled: false }, NOW).stripe).toBe(false);
  });

  it("blocks when charges are disabled", () => {
    expect(evaluateGates({ ...green, stripeChargesEnabled: false }, NOW).stripe).toBe(false);
  });

  it("blocks when payouts are frozen", () => {
    expect(evaluateGates({ ...green, payoutFrozen: true }, NOW).stripe).toBe(false);
  });

  it("treats null flags as false", () => {
    expect(evaluateGates({ ...green, stripeDetailsSubmitted: null }, NOW).stripe).toBe(false);
  });
});

describe("regression handling", () => {
  it("moves an approved provider to manual_review and unbooks them", () => {
    const g = evaluateGates({ ...green, stripePayoutsEnabled: false }, NOW);
    const d = decideApprovalState(g, "approved");
    expect(d).toEqual({ state: "manual_review", isPublic: false, isBookable: false });
  });

  it("keeps rejected and suspended sticky even when all gates pass", () => {
    const g = evaluateGates(green, NOW);
    expect(decideApprovalState(g, "rejected").state).toBe("rejected");
    expect(decideApprovalState(g, "suspended").state).toBe("suspended");
    expect(decideApprovalState(g, "suspended").isBookable).toBe(false);
  });

  it("never marks a non-green provider public or bookable", () => {
    const g = evaluateGates({ ...green, photoPath: null }, NOW);
    const d = decideApprovalState(g);
    expect(d.isPublic).toBe(false);
    expect(d.isBookable).toBe(false);
  });
});

describe("mapSumsubReview", () => {
  it("maps completed + GREEN to approved", () => {
    expect(mapSumsubReview("completed", "GREEN")).toBe("approved");
  });
  it("maps completed + RED to rejected", () => {
    expect(mapSumsubReview("completed", "RED")).toBe("rejected");
  });
  it("maps RED + RETRY to retry", () => {
    expect(mapSumsubReview("completed", "RED", "RETRY")).toBe("retry");
  });
  it("maps pending review to pending", () => {
    expect(mapSumsubReview("pending", "GREEN")).toBe("pending");
  });
  it("maps onHold to on_hold", () => {
    expect(mapSumsubReview("onHold", null)).toBe("on_hold");
  });
  it("maps unknown input to pending", () => {
    expect(mapSumsubReview(null, null)).toBe("pending");
  });
});
