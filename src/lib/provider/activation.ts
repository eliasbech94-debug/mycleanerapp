/**
 * Provider activation state — single source of truth for the restricted
 * onboarding dashboard.
 *
 * Mirrors the server-side gate in `supabase/functions/_shared/providerGate.ts`.
 * The UI uses it to decide what a provider may see; the server decides what a
 * provider may do. Both must agree, and neither trusts the other.
 */

export type ProviderActivationState =
  | "active"
  | "no_profile"
  | "missing_profile_details"
  | "missing_identity"
  | "missing_stripe"
  | "pending_review"
  | "paused"
  | "suspended"
  | "rejected"
  | "archived";

export interface ProviderActivationInput {
  status: string | null;
  identity_status?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  completion_pct?: number | null;
}

export interface ProviderActivation {
  /** True only when the provider may operate as an active provider. */
  active: boolean;
  state: ProviderActivationState;
  /** i18n key suffix under `provider:activation.<state>`. */
  i18nKey: string;
  /** Ordered next steps the provider can actually complete right now. */
  nextSteps: ProviderNextStep[];
  tone: "info" | "warning" | "destructive";
}

export interface ProviderNextStep {
  id: string;
  to: string;
  primary?: boolean;
}

const STEP_PROFILE: ProviderNextStep = { id: "profile", to: "/provider/profile", primary: true };
const STEP_IDENTITY: ProviderNextStep = { id: "identity", to: "/verify-identity", primary: true };
const STEP_STRIPE: ProviderNextStep = { id: "stripe", to: "/provider/finance", primary: true };
const STEP_DOCUMENTS: ProviderNextStep = { id: "documents", to: "/provider/profile" };
const STEP_SUPPORT: ProviderNextStep = { id: "support", to: "/support" };
const STEP_APPEAL: ProviderNextStep = { id: "appeal", to: "/provider/decisions", primary: true };

function build(
  state: ProviderActivationState,
  nextSteps: ProviderNextStep[],
  tone: ProviderActivation["tone"] = "info",
): ProviderActivation {
  return { active: state === "active", state, i18nKey: `activation.${state}`, nextSteps, tone };
}

/**
 * Fail-closed: an unknown or missing profile is never treated as active.
 */
export function deriveProviderActivation(
  profile: ProviderActivationInput | null | undefined,
): ProviderActivation {
  if (!profile) return build("no_profile", [STEP_PROFILE, STEP_SUPPORT], "warning");

  const status = profile.status ?? "draft";

  if (status === "archived") return build("archived", [STEP_SUPPORT], "destructive");
  if (status === "rejected") return build("rejected", [STEP_APPEAL, STEP_SUPPORT], "destructive");
  if (status === "suspended") return build("suspended", [STEP_APPEAL, STEP_SUPPORT], "destructive");
  if (status === "active") return build("active", []);
  if (status === "paused") return build("paused", [STEP_PROFILE, STEP_SUPPORT], "warning");

  const needsIdentity = profile.identity_status !== "approved";
  const needsStripe =
    profile.stripe_charges_enabled !== true || profile.stripe_payouts_enabled !== true;
  const incomplete =
    typeof profile.completion_pct === "number" && profile.completion_pct < 100;

  if (status === "pending_identity" || (status === "draft" && needsIdentity && !incomplete)) {
    return build("missing_identity", [STEP_IDENTITY, STEP_DOCUMENTS, STEP_SUPPORT], "warning");
  }
  if (status === "pending_stripe") {
    return build("missing_stripe", [STEP_STRIPE, STEP_SUPPORT], "warning");
  }
  if (status === "pending_review") {
    return build("pending_review", [STEP_PROFILE, STEP_SUPPORT]);
  }
  if (incomplete || status === "draft") {
    const steps = [STEP_PROFILE];
    if (needsIdentity) steps.push(STEP_IDENTITY);
    if (needsStripe) steps.push(STEP_STRIPE);
    steps.push(STEP_SUPPORT);
    return build("missing_profile_details", steps, "warning");
  }

  // Unknown status → restricted, never active.
  return build("pending_review", [STEP_PROFILE, STEP_SUPPORT]);
}
