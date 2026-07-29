// Deterministic, explainable eligibility & placement interface.
//
// This is the Experience Engine seam. It intentionally uses only signals
// that the frontend already knows and that the user has consented to.
// Never pass raw personal data through here. Each decision returns a
// non-sensitive `reason` code so we can inspect / A-B / audit behaviour.
//
// The engine is **off by default** (gated on `campaigns.personalization`
// feature flag). When off, `evaluate` always returns the `safe_default`
// placement so the campaign still works for every visitor.

export interface EligibilitySignals {
  countryIso?: string | null;
  locale?: string | null;
  region?: string | null;
  isAuthenticated?: boolean;
  userType?: "customer" | "provider" | "guest" | null;
  hasCompletedBooking?: boolean;
  providerStatus?: string | null;
  deviceClass?: "mobile" | "tablet" | "desktop" | null;
  referralSource?: string | null;
  consentAnalytics?: boolean;
}

export interface CampaignPlacementRule {
  id: string;
  when?: Partial<{
    countryIsoIn: string[];
    userTypeIn: Array<"customer" | "provider" | "guest">;
    isAuthenticated: boolean;
    deviceClassIn: Array<"mobile" | "tablet" | "desktop">;
  }>;
  variant: string;
}

export interface EligibilityDecision {
  variant: string;
  reason: string;
  personalizationApplied: boolean;
}

const SAFE_DEFAULT: EligibilityDecision = {
  variant: "default",
  reason: "safe_default",
  personalizationApplied: false,
};

/**
 * Deterministic placement engine. Rules are evaluated in order; the first
 * match wins. When personalisation is disabled OR the visitor opts out of
 * analytics OR no rule matches, the safe default fires.
 */
export function evaluate(
  signals: EligibilitySignals,
  rules: CampaignPlacementRule[],
  opts: { personalizationEnabled: boolean } = { personalizationEnabled: false },
): EligibilityDecision {
  if (!opts.personalizationEnabled) return SAFE_DEFAULT;
  if (signals.consentAnalytics === false) {
    return { ...SAFE_DEFAULT, reason: "consent_declined" };
  }

  for (const rule of rules) {
    if (matches(rule.when, signals)) {
      return {
        variant: rule.variant,
        reason: `rule:${rule.id}`,
        personalizationApplied: true,
      };
    }
  }
  return { ...SAFE_DEFAULT, reason: "no_rule_matched" };
}

function matches(when: CampaignPlacementRule["when"], s: EligibilitySignals): boolean {
  if (!when) return true;
  if (when.countryIsoIn && (!s.countryIso || !when.countryIsoIn.includes(s.countryIso))) return false;
  if (when.userTypeIn && (!s.userType || !when.userTypeIn.includes(s.userType))) return false;
  if (typeof when.isAuthenticated === "boolean" && when.isAuthenticated !== !!s.isAuthenticated) return false;
  if (when.deviceClassIn && (!s.deviceClass || !when.deviceClassIn.includes(s.deviceClass))) return false;
  return true;
}
