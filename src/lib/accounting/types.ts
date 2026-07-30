/**
 * International accounting engine — shared type contracts.
 *
 * NOTHING in this file encodes the rules of any specific country. All legal
 * behaviour is data, supplied by an approved, version-controlled rule pack.
 */

export type ProviderRegistrationType =
  | "individual"
  | "sole_trader"
  | "self_employed"
  | "company"
  | "partnership"
  | "other";

export type IndirectTaxType = "vat" | "gst" | "sales_tax" | "none" | "unknown";

export type RulePackStatus = "draft" | "in_review" | "approved" | "published" | "retired";

export type ExpenseTreatment =
  | "generally_allowed"
  | "partially_allowed"
  | "capital_asset"
  | "special_review"
  | "generally_disallowed";

export type IndirectTaxTreatment =
  | "deductible"
  | "partially_deductible"
  | "non_deductible"
  | "not_applicable"
  | "review_required";

export type MileageMethod =
  | "fixed_rate"
  | "actual_vehicle_cost"
  | "mixed_method"
  | "not_supported"
  | "manual_review";

export type FilingPeriodKind =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "other_local";

/** Registration profile — sourced from verified provider profile data only. */
export interface ProviderAccountingProfile {
  providerUserId: string;

  registrationCountry: string | null;
  taxResidenceCountry: string | null;
  primaryWorkCountry: string | null;

  registrationType: ProviderRegistrationType | null;

  /** Masked only. Full numbers never travel to the accounting layer. */
  businessRegistrationNumberLast4: string | null;
  businessRegistrationType: string | null;

  taxIdentificationNumberLast4: string | null;
  taxIdentificationType: string | null;

  indirectTaxRegistered: boolean | null;
  indirectTaxType: IndirectTaxType;
  indirectTaxNumberLast4: string | null;

  accountingCurrency: string | null;
  preferredLocale: string | null;

  /** Legacy migration metadata — presence forces manual review. */
  profileMigrationSource?: string | null;
  profileMigrationVersion?: string | null;
  profileMigratedAt?: string | null;
  profileRequiresReview?: boolean | null;
}

export interface RulePackSource {
  officialSourceName: string;
  officialSourceUrl: string;
  sourceDocumentTitle: string | null;
  sourcePublishedAt: string | null;
  sourceCheckedAt: string | null;
  checkedBy: string | null;
  verificationNotes: string | null;
}

export interface ExpenseCategoryRule {
  categoryCode: string;
  localTitle: string;
  description: string;
  allowedRegistrationTypes: ProviderRegistrationType[];
  treatment: ExpenseTreatment;
  businessUseRequired: boolean;
  documentationRequired: boolean;
  indirectTaxTreatment: IndirectTaxTreatment;
  maximumDeductiblePercentage: number | null;
  localConditions: string[];
  warningText: string | null;
  officialGuidanceReference: string | null;
  /** Authored in the Rule Pack Manager. Presentation + AI hints only. */
  icon?: string | null;
  sortOrder?: number | null;
  mixedUseAllowed?: boolean;
  capitalAsset?: boolean;
  requiresManualReview?: boolean;
  aiKeywords?: string[];
}

export interface IndirectTaxRateRule {
  taxCode: string;
  /** Rate in basis points (integer). 2500 = 25 %. Never a float. */
  rateBasisPoints: number;
  appliesToCategories: string[] | null;
  reverseCharge: boolean;
  exempt: boolean;
  description: string;
}

export interface MileageRuleBand {
  vehicleType: string;
  /** Minor units of `currency` per one `distanceUnit`. Integer. */
  minorPerDistanceUnit: number;
  fromDistance: number;
  toDistance: number | null;
}

export interface MileageRules {
  method: MileageMethod;
  distanceUnit: "km" | "mile" | null;
  currency: string | null;
  vehicleTypes: string[];
  rateBands: MileageRuleBand[];
  annualDistanceThresholds: number[];
  commutingTreatment: ExpenseTreatment;
  homeToCustomerTreatment: ExpenseTreatment;
  customerToCustomerTreatment: ExpenseTreatment;
  parkingTreatment: ExpenseTreatment;
  tollTreatment: ExpenseTreatment;
  publicTransportTreatment: ExpenseTreatment;
  documentationRequirements: string[];
}

export interface MixedUseRules {
  /** Hard ceiling applied on top of the provider's own claim, if any. */
  maximumBusinessUsePercentage: number | null;
  documentationRequiredAbovePercentage: number | null;
  categoriesRequiringReview: string[];
  categoriesDisallowed: string[];
}

export interface RulePackLabels {
  businessRegistrationLabel: string;
  indirectTaxLabel: string;
  indirectTaxNumberLabel: string;
  taxIdentificationLabel: string;
  registrationTypeLabels: Partial<Record<ProviderRegistrationType, string>>;
  filingPeriodLabel: string;
  preliminaryAmountLabel: string;
}

export interface AccountingRulePack {
  id: string;
  countryCode: string;
  regionCode: string | null;
  rulePackVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: RulePackStatus;

  supportedRegistrationTypes: ProviderRegistrationType[];
  supportedIndirectTaxTypes: IndirectTaxType[];

  defaultCurrency: string;
  supportedCurrencies: string[];
  defaultLocale: string;

  indirectTaxEnabled: boolean;
  indirectTaxName: string | null;
  indirectTaxSystem: "vat_like" | "sales_tax_like" | null;
  indirectTaxRegistrationThresholdMinor: number | null;
  indirectTaxThresholdCurrency: string | null;

  defaultIndirectTaxRates: IndirectTaxRateRule[];
  reducedIndirectTaxRates: IndirectTaxRateRule[];
  zeroRateRules: IndirectTaxRateRule[];
  reverseChargeRules: IndirectTaxRateRule[];

  expenseCategories: ExpenseCategoryRule[];
  mixedUseRules: MixedUseRules;
  capitalAssetRules: { thresholdMinor: number | null; notes: string[] };
  depreciationRules: { method: string | null; notes: string[] };

  mileageRules: MileageRules;

  receiptRequirements: string[];
  invoiceRequirements: string[];
  recordRetentionRules: string[];

  filingPeriodOptions: FilingPeriodKind[];
  filingDeadlines: { periodKind: FilingPeriodKind; description: string }[];

  labels: RulePackLabels;
  disclaimers: string[];
  officialGuidanceLinks: { title: string; url: string }[];

  /**
   * External-income recognition policy. Optional: when absent the engine uses
   * the conservative fallback in `externalIncome.ts` instead of guessing.
   */
  externalIncomeRules?: import("./externalIncome").ExternalIncomeRules;

  sources: RulePackSource[];
  verifiedAt: string | null;
  verifiedBy: string | null;
  sourceVersion: string | null;


  /**
   * Preview/fixture marker. Never true for a pack loaded from the database;
   * used so development previews can render UI without ever claiming that
   * the numbers are real legislation.
   */
  sampleOnly?: boolean;
}

export interface AccountingPeriod {
  /** ISO date, first day of the period (inclusive). */
  periodStart: string;
  /** ISO date, last day of the period (inclusive). */
  periodEnd: string;
  kind: FilingPeriodKind;
  status: "open" | "closed";
  /** Frozen on close. Never recomputed. */
  frozenRulePackId?: string | null;
  frozenRulePackVersion?: string | null;
  frozenJurisdictionCode?: string | null;
  frozenAccountingCurrency?: string | null;
  frozenCalculationVersion?: string | null;
}

export type JurisdictionResolution =
  | {
      status: "resolved";
      jurisdictionCode: string;
      countryCode: string;
      regionCode: string | null;
      rulePackVersion: string;
      rulePackId: string;
      effectiveFrom: string;
      effectiveTo: string | null;
      currency: string;
      locale: string;
    }
  | {
      status: "requires_review";
      reasonCode:
        | "missing_country"
        | "conflicting_countries"
        | "no_rule_pack"
        | "rule_pack_not_published"
        | "rule_pack_not_effective"
        | "rule_pack_empty";
      candidateCountries: string[];
      message: string;
    };

export interface AccountingItem {
  id: string;
  kind: "income" | "expense" | "mileage" | "adjustment";
  label: string;
  /** Minor units in the accounting currency. */
  accountingAmountMinor: number;
  categoryCode: string | null;
  reasonCode: string | null;
  reason: string | null;
}

export interface MoneyAmount {
  originalAmountMinor: number;
  originalCurrency: string;
  accountingAmountMinor: number;
  accountingCurrency: string;
  /** Decimal string, never a float literal. e.g. "7.4512300000". */
  exchangeRate: string;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
}

export interface IncomeInput extends MoneyAmount {
  id: string;
  label: string;
  transactionDate: string;
  platformFeeMinor: number;
}

export interface ExpenseInput extends MoneyAmount {
  id: string;
  label: string;
  transactionDate: string;
  categoryCode: string | null;
  merchantCountry: string | null;
  businessUsePercentage: number | null;
  taxCodeHint: string | null;
  hasDocumentation: boolean;
  aiSuggested: boolean;
  approvedByProvider: boolean;
}

export interface MileageInput {
  id: string;
  label: string;
  transactionDate: string;
  distance: number;
  vehicleType: string;
  tripType: "commuting" | "home_to_customer" | "customer_to_customer" | "other";
  hasDocumentation: boolean;
}

export interface AdjustmentInput extends MoneyAmount {
  id: string;
  label: string;
  transactionDate: string;
  note: string | null;
}

export interface CalculationInput {
  provider: ProviderAccountingProfile;
  accountingPeriod: AccountingPeriod;
  rulePack: AccountingRulePack | null;
  jurisdiction: JurisdictionResolution;
  /** Verified MyCleaner booking/payment income only. */
  income: IncomeInput[];
  /** Manually registered income from outside MyCleaner. */
  externalIncome?: import("./externalIncome").ExternalIncomeInput[];
  expenses: ExpenseInput[];
  mileage: MileageInput[];
  adjustments: AdjustmentInput[];
}


export interface IndirectTaxSummary {
  system: "vat_like" | "sales_tax_like";
  label: string;
  /** vat_like */
  outputTaxMinor?: number;
  inputTaxMinor?: number;
  adjustmentsMinor?: number;
  /** sales_tax_like */
  taxableSalesMinor?: number;
  salesTaxCollectedMinor?: number;
  exemptSalesMinor?: number;
  localTaxJurisdiction?: string | null;
  estimatedLiabilityMinor?: number;
}

export interface CalculationResult {
  preliminaryAmountToRegisterMinor: number | null;
  preliminaryBusinessResultMinor: number | null;

  indirectTaxPayableMinor: number | null;
  indirectTaxReceivableMinor: number | null;
  indirectTax: IndirectTaxSummary | null;

  includedIncomeMinor: number;
  includedExpensesMinor: number;
  includedMileageAmountMinor: number;

  /** Verified MyCleaner income (automatic). */
  myCleanerIncomeMinor: number;
  /** Manually registered income from outside MyCleaner that the rules include. */
  externalIncomeMinor: number;
  /** myCleanerIncomeMinor + externalIncomeMinor. Frontend never sums this itself. */
  totalIncomeMinor: number;

  includedExternalIncomeItems: string[];
  excludedExternalIncomeItems: string[];
  reviewRequiredExternalIncomeItems: string[];

  incomeBySource: {
    sourceType: string;
    sourceName: string | null;
    amountMinor: number;
    currency: string;
  }[];

  excludedItems: AccountingItem[];
  reviewRequiredItems: AccountingItem[];


  calculationVersion: string;
  rulePackVersion: string | null;
  jurisdictionCode: string | null;
  accountingCurrency: string | null;

  status:
    | "ready_for_review"
    | "missing_documentation"
    | "rules_require_review"
    | "missing_country_or_registration"
    | "cannot_calculate";

  warnings: string[];
  explanationLines: string[];
}
