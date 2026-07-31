/**
 * Provider approval gate model.
 *
 * This is the client-side mirror of the SQL functions
 * `public.provider_approval_gates(uuid)` and
 * `public.evaluate_provider_approval(uuid)`.
 *
 * The database is authoritative — this module exists so the UI can render the
 * checklist and so the exact formula is covered by unit tests. Any change here
 * MUST be mirrored in the migration and vice versa.
 */

export const APPROVAL_STATES = [
  "incomplete",
  "awaiting_identity",
  "identity_in_review",
  "awaiting_profile_photo",
  "photo_in_review",
  "awaiting_profile_completion",
  "awaiting_documents",
  "awaiting_stripe",
  "manual_review",
  "approved",
  "rejected",
  "suspended",
] as const;

export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const GATE_KEYS = [
  "identity",
  "photo",
  "profile",
  "services",
  "quiz",
  "documents",
  "stripe",
] as const;

export type GateKey = (typeof GATE_KEYS)[number];

export interface GateInput {
  /** provider_profiles.identity_status */
  identityStatus?: string | null;
  /** person_identities.metadata.reviewStatus */
  sumsubReviewStatus?: string | null;
  /** person_identities.metadata.reviewAnswer */
  sumsubReviewAnswer?: string | null;
  /** Sumsub result originated in the sandbox environment */
  identitySandbox?: boolean | null;
  /** platform runs in production */
  production?: boolean;

  photoPath?: string | null;
  photoModerationStatus?: string | null;

  displayName?: string | null;
  headline?: string | null;
  bio?: string | null;
  dateOfBirth?: string | null;
  languages?: string[] | null;
  baseAddressPlaceId?: string | null;
  baseCountryCode?: string | null;
  smsVerifiedAt?: string | null;
  emailConfirmedAt?: string | null;
  termsAcceptedAt?: string | null;

  activeServiceRates?: number[] | null;
  countryMinRateMinor?: number | null;

  quizPassedAt?: string | null;

  insuranceDocPath?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceExpiresOn?: string | null;

  stripeDetailsSubmitted?: boolean | null;
  stripePayoutsEnabled?: boolean | null;
  stripeChargesEnabled?: boolean | null;
  stripeRequirementsDue?: string[] | null;
  payoutFrozen?: boolean | null;
}

export interface GateResult {
  identity: boolean;
  identityInReview: boolean;
  photo: boolean;
  photoInReview: boolean;
  profile: boolean;
  services: boolean;
  quiz: boolean;
  documents: boolean;
  stripe: boolean;
  allGreen: boolean;
  missing: GateKey[];
}

/** NULL / unknown / missing always evaluates to FALSE. */
const yes = (v: unknown): boolean => v === true;

function isAdult(dob: string | null | undefined, now: Date): boolean {
  if (!dob) return false;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return d.getTime() <= cutoff.getTime();
}

export function evaluateGates(input: GateInput, now: Date = new Date()): GateResult {
  const production = input.production !== false;

  // 1 — Sumsub identity. completed + GREEN + non-sandbox in production.
  const identity =
    input.identityStatus === "approved" &&
    input.sumsubReviewStatus === "completed" &&
    (input.sumsubReviewAnswer ?? "").toUpperCase() === "GREEN" &&
    (!production || input.identitySandbox === false);
  const identityInReview =
    !identity && (input.identityStatus === "pending" || input.identityStatus === "on_hold");

  // 2 — profile photo moderation
  const photo = !!input.photoPath && input.photoModerationStatus === "approved";
  const photoInReview =
    !!input.photoPath &&
    (input.photoModerationStatus === "pending" || input.photoModerationStatus === "manual_review");

  // 3 — profile completeness
  const profile =
    (input.displayName ?? "").trim().length > 0 &&
    (input.headline ?? "").trim().length > 0 &&
    (input.bio ?? "").trim().length >= 40 &&
    isAdult(input.dateOfBirth, now) &&
    (input.languages?.length ?? 0) > 0 &&
    !!input.baseAddressPlaceId &&
    !!input.baseCountryCode &&
    !!input.smsVerifiedAt &&
    !!input.emailConfirmedAt &&
    !!input.termsAcceptedAt;

  // 4 — at least one active service priced at or above the country floor
  const min = input.countryMinRateMinor;
  const services =
    typeof min === "number" &&
    Number.isFinite(min) &&
    (input.activeServiceRates ?? []).some((r) => typeof r === "number" && r >= min);

  // 5 — mandatory quiz
  const quiz = !!input.quizPassedAt;

  // 6 — insurance documents, still valid
  const documents =
    !!input.insuranceDocPath &&
    (input.insurancePolicyNumber ?? "").trim().length > 0 &&
    !!input.insuranceExpiresOn &&
    new Date(input.insuranceExpiresOn).getTime() > now.getTime();

  // 7 — Stripe Connect payout readiness
  const stripe =
    yes(input.stripeDetailsSubmitted) &&
    yes(input.stripePayoutsEnabled) &&
    yes(input.stripeChargesEnabled) &&
    (input.stripeRequirementsDue?.length ?? 0) === 0 &&
    input.payoutFrozen !== true;

  const flags: Record<GateKey, boolean> = {
    identity,
    photo,
    profile,
    services,
    quiz,
    documents,
    stripe,
  };
  const missing = GATE_KEYS.filter((k) => !flags[k]);

  return {
    identity,
    identityInReview,
    photo,
    photoInReview,
    profile,
    services,
    quiz,
    documents,
    stripe,
    allGreen: missing.length === 0,
    missing,
  };
}

export interface EngineDecision {
  state: ApprovalState;
  isPublic: boolean;
  isBookable: boolean;
}

/**
 * Mirror of `evaluate_provider_approval`. `previousState` matters: an already
 * approved provider that loses a gate goes to manual_review and stops being
 * bookable rather than falling back to an onboarding state.
 */
export function decideApprovalState(
  gates: GateResult,
  previousState: ApprovalState = "incomplete",
): EngineDecision {
  if (previousState === "rejected" || previousState === "suspended") {
    return { state: previousState, isPublic: false, isBookable: false };
  }

  if (gates.allGreen) {
    return { state: "approved", isPublic: true, isBookable: true };
  }

  let state: ApprovalState;
  if (!gates.identity) {
    state = gates.identityInReview ? "identity_in_review" : "awaiting_identity";
  } else if (!gates.photo) {
    state = gates.photoInReview ? "photo_in_review" : "awaiting_profile_photo";
  } else if (!gates.profile || !gates.services || !gates.quiz) {
    state = "awaiting_profile_completion";
  } else if (!gates.documents) {
    state = "awaiting_documents";
  } else if (!gates.stripe) {
    state = "awaiting_stripe";
  } else {
    state = "manual_review";
  }

  if (previousState === "approved") state = "manual_review";

  return { state, isPublic: false, isBookable: false };
}

/**
 * Map a Sumsub review to the internal identity status.
 * GREEN without `completed` is never approved.
 */
export function mapSumsubReview(
  reviewStatus: string | null | undefined,
  reviewAnswer: string | null | undefined,
  rejectType?: string | null,
): "pending" | "approved" | "rejected" | "on_hold" | "retry" {
  const s = (reviewStatus ?? "").toLowerCase();
  const a = (reviewAnswer ?? "").toUpperCase();
  if (s === "onhold") return "on_hold";
  if (s !== "completed") return "pending";
  if (a === "GREEN") return "approved";
  if (a === "RED") {
    return (rejectType ?? "").toUpperCase() === "RETRY" ? "retry" : "rejected";
  }
  return "pending";
}
