import { applyBasisPoints, applyPercentage, assertInteger } from "./money";
import type {
  AccountingRulePack,
  ExpenseCategoryRule,
  ExpenseInput,
  IndirectTaxRateRule,
  MileageInput,
  MileageRules,
  ProviderAccountingProfile,
} from "./types";

export const RULE_ENGINE_VERSION = "rule-engine-1.0.0";

export interface ResolvedTaxRule {
  status: "resolved" | "review_required" | "not_applicable";
  taxCode: string | null;
  rateBasisPoints: number | null;
  taxJurisdiction: string | null;
  taxTreatment: string;
  reverseCharge: boolean;
  taxExempt: boolean;
  reason: string;
}

export interface ResolveIndirectTaxRuleArgs {
  rulePack: AccountingRulePack;
  transactionDate: string;
  serviceCountry: string | null;
  expenseCategory: string | null;
  merchantCountry: string | null;
  taxCode?: string | null;
}

function matchesCategory(rule: IndirectTaxRateRule, category: string | null): boolean {
  if (!rule.appliesToCategories) return true;
  if (!category) return false;
  return rule.appliesToCategories.includes(category);
}

export function resolveIndirectTaxRule(args: ResolveIndirectTaxRuleArgs): ResolvedTaxRule {
  const { rulePack, expenseCategory, merchantCountry, taxCode } = args;

  if (!rulePack.indirectTaxEnabled) {
    return {
      status: "not_applicable",
      taxCode: null,
      rateBasisPoints: null,
      taxJurisdiction: rulePack.countryCode,
      taxTreatment: "not_applicable",
      reverseCharge: false,
      taxExempt: false,
      reason: "Det aktive regelsæt har ikke indirekte skat aktiveret.",
    };
  }

  // Date must be inside the pack's validity — callers pick the pack by period,
  // this is a second guard for per-transaction dates.
  if (
    args.transactionDate < rulePack.effectiveFrom ||
    (rulePack.effectiveTo && args.transactionDate > rulePack.effectiveTo)
  ) {
    return reviewRequired(rulePack, "Bilagets dato ligger uden for den aktive regelversion.");
  }

  const all = [
    ...rulePack.reverseChargeRules,
    ...rulePack.zeroRateRules,
    ...rulePack.reducedIndirectTaxRates,
    ...rulePack.defaultIndirectTaxRates,
  ];

  if (taxCode) {
    const explicit = all.find((rule) => rule.taxCode === taxCode);
    if (!explicit) return reviewRequired(rulePack, "Ukendt skattekode for det aktive regelsæt.");
    return toResolved(rulePack, explicit);
  }

  if (merchantCountry && merchantCountry.toUpperCase() !== rulePack.countryCode.toUpperCase()) {
    const crossBorder = rulePack.reverseChargeRules.find((rule) =>
      matchesCategory(rule, expenseCategory),
    );
    if (crossBorder) return toResolved(rulePack, crossBorder);
    return reviewRequired(
      rulePack,
      "Bilaget er udstedt i et andet land end regelsættets. Skattebehandlingen kræver kontrol",
    );
  }

  const candidates = all.filter((rule) => matchesCategory(rule, expenseCategory));
  if (candidates.length === 0) {
    return reviewRequired(rulePack, "Skattebehandlingen kræver kontrol");
  }
  const specific = candidates.find((rule) => rule.appliesToCategories) ?? candidates[0];
  return toResolved(rulePack, specific);
}

function toResolved(pack: AccountingRulePack, rule: IndirectTaxRateRule): ResolvedTaxRule {
  return {
    status: "resolved",
    taxCode: rule.taxCode,
    rateBasisPoints: rule.exempt ? 0 : rule.rateBasisPoints,
    taxJurisdiction: pack.regionCode ? `${pack.countryCode}-${pack.regionCode}` : pack.countryCode,
    taxTreatment: rule.reverseCharge ? "reverse_charge" : rule.exempt ? "exempt" : "standard",
    reverseCharge: rule.reverseCharge,
    taxExempt: rule.exempt,
    reason: rule.description,
  };
}

function reviewRequired(pack: AccountingRulePack, reason: string): ResolvedTaxRule {
  return {
    status: "review_required",
    taxCode: null,
    rateBasisPoints: null,
    taxJurisdiction: pack.countryCode,
    taxTreatment: "review_required",
    reverseCharge: false,
    taxExempt: false,
    reason,
  };
}

export function findCategoryRule(
  pack: AccountingRulePack,
  categoryCode: string | null,
): ExpenseCategoryRule | null {
  if (!categoryCode) return null;
  return pack.expenseCategories.find((cat) => cat.categoryCode === categoryCode) ?? null;
}

export interface MixedUseOutcome {
  outcome: "allowed" | "limited" | "review_required" | "disallowed";
  deductibleAmountMinor: number;
  appliedPercentage: number;
  reason: string;
}

/**
 * The provider's own business-use percentage is an input, never the verdict.
 * The active country rule decides the final deductible amount.
 */
export function calculateMixedUseExpense(args: {
  rulePack: AccountingRulePack;
  expenseAmountMinor: number;
  businessUsePercentage: number | null;
  categoryCode: string | null;
  registrationType: ProviderAccountingProfile["registrationType"];
  hasDocumentation: boolean;
}): MixedUseOutcome {
  const { rulePack, expenseAmountMinor, categoryCode, registrationType, hasDocumentation } = args;
  assertInteger(expenseAmountMinor, "expenseAmountMinor");

  const rule = findCategoryRule(rulePack, categoryCode);
  if (!rule) {
    return {
      outcome: "review_required",
      deductibleAmountMinor: 0,
      appliedPercentage: 0,
      reason: "Kategorien findes ikke i det aktive regelsæt for dit land.",
    };
  }

  if (!registrationType || !rule.allowedRegistrationTypes.includes(registrationType)) {
    return {
      outcome: "review_required",
      deductibleAmountMinor: 0,
      appliedPercentage: 0,
      reason: "Kategorien er ikke omfattet af din registreringsform i dette land.",
    };
  }

  if (
    rule.treatment === "generally_disallowed" ||
    rulePack.mixedUseRules.categoriesDisallowed.includes(rule.categoryCode)
  ) {
    return {
      outcome: "disallowed",
      deductibleAmountMinor: 0,
      appliedPercentage: 0,
      reason: rule.warningText || "Kategorien kan ikke fratrækkes efter det aktive regelsæt.",
    };
  }

  if (
    rule.treatment === "special_review" ||
    rule.treatment === "capital_asset" ||
    rulePack.mixedUseRules.categoriesRequiringReview.includes(rule.categoryCode)
  ) {
    return {
      outcome: "review_required",
      deductibleAmountMinor: 0,
      appliedPercentage: 0,
      reason: rule.warningText || "Posten kræver manuel kontrol efter det aktive regelsæt.",
    };
  }

  const claimed = args.businessUsePercentage;
  if (rule.businessUseRequired && (claimed == null || claimed <= 0)) {
    return {
      outcome: "review_required",
      deductibleAmountMinor: 0,
      appliedPercentage: 0,
      reason: "Erhvervsmæssig andel mangler for denne kategori.",
    };
  }

  let percentage = rule.businessUseRequired ? (claimed as number) : (claimed ?? 100);
  const ceilings = [rule.maximumDeductiblePercentage, rulePack.mixedUseRules.maximumBusinessUsePercentage]
    .filter((value): value is number => value != null);
  const ceiling = ceilings.length > 0 ? Math.min(...ceilings) : null;
  let limited = false;
  if (ceiling != null && percentage > ceiling) {
    percentage = ceiling;
    limited = true;
  }

  const docThreshold = rulePack.mixedUseRules.documentationRequiredAbovePercentage;
  const needsDoc =
    rule.documentationRequired || (docThreshold != null && percentage > docThreshold);
  if (needsDoc && !hasDocumentation) {
    return {
      outcome: "review_required",
      deductibleAmountMinor: 0,
      appliedPercentage: percentage,
      reason: "Dokumentation kræves efter det aktive regelsæt, før posten kan medregnes.",
    };
  }

  return {
    outcome: limited ? "limited" : "allowed",
    deductibleAmountMinor: applyPercentage(expenseAmountMinor, percentage),
    appliedPercentage: percentage,
    reason: limited
      ? `Den erhvervsmæssige andel er begrænset til ${percentage} % efter det aktive regelsæt.`
      : rule.localConditions[0] || "Medregnet efter det aktive regelsæt.",
  };
}

export interface MileageOutcome {
  outcome: "allowed" | "partial" | "review_required" | "not_allowed" | "not_supported";
  amountMinor: number;
  currency: string | null;
  reason: string;
}

function treatmentFor(rules: MileageRules, trip: MileageInput["tripType"]) {
  switch (trip) {
    case "commuting":
      return rules.commutingTreatment;
    case "home_to_customer":
      return rules.homeToCustomerTreatment;
    case "customer_to_customer":
      return rules.customerToCustomerTreatment;
    default:
      return "special_review" as const;
  }
}

export function calculateMileage(args: {
  rulePack: AccountingRulePack;
  trip: MileageInput;
  accumulatedDistance: number;
}): MileageOutcome {
  const rules = args.rulePack.mileageRules;
  if (rules.method === "not_supported") {
    return {
      outcome: "not_supported",
      amountMinor: 0,
      currency: rules.currency,
      reason: "Kørsel indgår ikke i det aktive regelsæt for dit land.",
    };
  }
  if (rules.method === "manual_review" || rules.method === "actual_vehicle_cost") {
    return {
      outcome: "review_required",
      amountMinor: 0,
      currency: rules.currency,
      reason:
        rules.method === "actual_vehicle_cost"
          ? "Landet anvender faktiske vognudgifter. Posten kræver manuel kontrol."
          : "Kørsel kræver manuel kontrol i det aktive regelsæt.",
    };
  }

  const treatment = treatmentFor(rules, args.trip.tripType);
  if (treatment === "generally_disallowed") {
    return {
      outcome: "not_allowed",
      amountMinor: 0,
      currency: rules.currency,
      reason: "Denne turtype kan ikke medregnes efter det aktive regelsæt.",
    };
  }
  if (treatment === "special_review" || treatment === "capital_asset") {
    return {
      outcome: "review_required",
      amountMinor: 0,
      currency: rules.currency,
      reason: "Turtypen kræver manuel kontrol efter det aktive regelsæt.",
    };
  }
  if (rules.documentationRequirements.length > 0 && !args.trip.hasDocumentation) {
    return {
      outcome: "review_required",
      amountMinor: 0,
      currency: rules.currency,
      reason: "Dokumentation for ruten mangler.",
    };
  }
  if (!rules.vehicleTypes.includes(args.trip.vehicleType)) {
    return {
      outcome: "review_required",
      amountMinor: 0,
      currency: rules.currency,
      reason: "Køretøjstypen er ikke defineret i det aktive regelsæt.",
    };
  }

  // Distance bands are cumulative over the year; integer arithmetic only.
  let remaining = args.trip.distance;
  let position = args.accumulatedDistance;
  let total = 0;
  const bands = rules.rateBands
    .filter((band) => band.vehicleType === args.trip.vehicleType)
    .sort((a, b) => a.fromDistance - b.fromDistance);
  if (bands.length === 0) {
    return {
      outcome: "review_required",
      amountMinor: 0,
      currency: rules.currency,
      reason: "Der findes ingen sats for køretøjstypen i det aktive regelsæt.",
    };
  }

  while (remaining > 0) {
    const band = bands.find(
      (candidate) =>
        position >= candidate.fromDistance &&
        (candidate.toDistance == null || position < candidate.toDistance),
    );
    if (!band) {
      return {
        outcome: "review_required",
        amountMinor: 0,
        currency: rules.currency,
        reason: "Distancen falder uden for de definerede satsintervaller.",
      };
    }
    const bandCapacity = band.toDistance == null ? remaining : band.toDistance - position;
    const consumed = Math.min(remaining, bandCapacity);
    total += Math.round(consumed * band.minorPerDistanceUnit);
    remaining -= consumed;
    position += consumed;
  }

  const partial = treatment === "partially_allowed";
  return {
    outcome: partial ? "partial" : "allowed",
    amountMinor: partial ? applyBasisPoints(total, 5000) : total,
    currency: rules.currency,
    reason: partial
      ? "Turtypen medregnes kun delvist efter det aktive regelsæt."
      : "Beregnet efter det aktive regelsæts satser.",
  };
}
