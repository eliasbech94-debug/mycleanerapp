/**
 * Rule Pack Manager — JSON import/export and the empty-pack template.
 *
 * Import never trusts the file: it validates structure and always lands the
 * result as a draft, unverified and unpublished, regardless of what the file
 * claims.
 */

import type { AccountingRulePack } from "../types";
import { validateRulePack, type ValidationReport } from "./validation";

export const RULE_PACK_EXPORT_FORMAT = "mycleaner.accounting.rule-pack";
export const RULE_PACK_EXPORT_VERSION = 1;

export interface RulePackExportEnvelope {
  format: typeof RULE_PACK_EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  rulePack: AccountingRulePack;
}

export function exportRulePack(
  pack: AccountingRulePack,
  now = new Date().toISOString(),
): RulePackExportEnvelope {
  return {
    format: RULE_PACK_EXPORT_FORMAT,
    formatVersion: RULE_PACK_EXPORT_VERSION,
    exportedAt: now,
    rulePack: pack,
  };
}

export type RulePackImportResult =
  | { ok: true; rulePack: AccountingRulePack; report: ValidationReport; notices: string[] }
  | { ok: false; errors: string[] };

const REQUIRED_KEYS = [
  "countryCode",
  "rulePackVersion",
  "effectiveFrom",
  "defaultCurrency",
  "defaultLocale",
  "expenseCategories",
] as const;

export function importRulePack(raw: string, newId: string): RulePackImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["Filen er ikke gyldig JSON."] };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["JSON-roden skal være et objekt."] };
  }

  const envelope = parsed as Partial<RulePackExportEnvelope> & Partial<AccountingRulePack>;
  const candidate = (envelope.rulePack ?? envelope) as Partial<AccountingRulePack>;

  if (envelope.format && envelope.format !== RULE_PACK_EXPORT_FORMAT) {
    return { ok: false, errors: [`Ukendt format “${envelope.format}”.`] };
  }
  if (
    envelope.formatVersion !== undefined &&
    envelope.formatVersion > RULE_PACK_EXPORT_VERSION
  ) {
    return {
      ok: false,
      errors: [`Filen bruger formatversion ${envelope.formatVersion}, som er nyere end understøttet (${RULE_PACK_EXPORT_VERSION}).`],
    };
  }

  const errors: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (candidate[key] === undefined || candidate[key] === null) {
      errors.push(`Feltet “${key}” mangler i filen.`);
    }
  }
  if (candidate.expenseCategories && !Array.isArray(candidate.expenseCategories)) {
    errors.push("“expenseCategories” skal være en liste.");
  }
  if (errors.length) return { ok: false, errors };

  const notices: string[] = [];
  const imported: AccountingRulePack = {
    ...createEmptyRulePack(newId, candidate.countryCode as string),
    ...(candidate as AccountingRulePack),
    id: newId,
    // Import can never carry lifecycle or verification state across.
    status: "draft",
    verifiedAt: null,
    verifiedBy: null,
    sampleOnly: false,
    sources: (candidate.sources ?? []).map((source) => ({
      ...source,
      sourceCheckedAt: null,
      checkedBy: null,
      verificationNotes: source.verificationNotes ?? null,
    })),
  };

  if (candidate.status && candidate.status !== "draft") {
    notices.push(`Filen angav status “${candidate.status}”. Importen er sat til draft.`);
  }
  if ((candidate.sources ?? []).some((s) => s.sourceCheckedAt || s.checkedBy)) {
    notices.push("Kildeverifikationer er nulstillet. Kilder skal verificeres på ny i dette miljø.");
  }

  return { ok: true, rulePack: imported, report: validateRulePack(imported), notices };
}

/** A blank pack. Deliberately contains no country rules of any kind. */
export function createEmptyRulePack(id: string, countryCode = ""): AccountingRulePack {
  return {
    id,
    countryCode,
    regionCode: null,
    rulePackVersion: "",
    effectiveFrom: "",
    effectiveTo: null,
    status: "draft",
    supportedRegistrationTypes: [],
    supportedIndirectTaxTypes: [],
    defaultCurrency: "",
    supportedCurrencies: [],
    defaultLocale: "",
    indirectTaxEnabled: false,
    indirectTaxName: null,
    indirectTaxSystem: null,
    indirectTaxRegistrationThresholdMinor: null,
    indirectTaxThresholdCurrency: null,
    defaultIndirectTaxRates: [],
    reducedIndirectTaxRates: [],
    zeroRateRules: [],
    reverseChargeRules: [],
    expenseCategories: [],
    mixedUseRules: {
      maximumBusinessUsePercentage: null,
      documentationRequiredAbovePercentage: null,
      categoriesRequiringReview: [],
      categoriesDisallowed: [],
    },
    capitalAssetRules: { thresholdMinor: null, notes: [] },
    depreciationRules: { method: null, notes: [] },
    mileageRules: {
      method: "manual_review",
      distanceUnit: null,
      currency: null,
      vehicleTypes: [],
      rateBands: [],
      annualDistanceThresholds: [],
      commutingTreatment: "special_review",
      homeToCustomerTreatment: "special_review",
      customerToCustomerTreatment: "special_review",
      parkingTreatment: "special_review",
      tollTreatment: "special_review",
      publicTransportTreatment: "special_review",
      documentationRequirements: [],
    },
    receiptRequirements: [],
    invoiceRequirements: [],
    recordRetentionRules: [],
    filingPeriodOptions: [],
    filingDeadlines: [],
    labels: {
      businessRegistrationLabel: "",
      indirectTaxLabel: "",
      indirectTaxNumberLabel: "",
      taxIdentificationLabel: "",
      registrationTypeLabels: {},
      filingPeriodLabel: "",
      preliminaryAmountLabel: "",
    },
    disclaimers: [],
    officialGuidanceLinks: [],
    sources: [],
    verifiedAt: null,
    verifiedBy: null,
    sourceVersion: null,
  };
}
