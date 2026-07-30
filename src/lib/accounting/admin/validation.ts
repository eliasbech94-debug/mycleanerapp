/**
 * Rule Pack Manager — validation engine.
 *
 * Produces blocking errors, warnings and recommendations. Publishing is gated
 * on this function returning zero blocking errors, so it is deliberately
 * strict: anything that could make the accounting engine guess a legal
 * outcome is blocking.
 */

import type { AccountingRulePack, ExpenseCategoryRule } from "../types";

export type ValidationSeverity = "blocking" | "warning" | "recommendation";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  field: string;
  message: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  blockingErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  recommendations: ValidationIssue[];
  verifiedSourceCount: number;
  hasBlockingErrors: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
const COUNTRY = /^[A-Z]{2}$/;

export function isSourceVerified(source: {
  officialSourceUrl?: string | null;
  sourceCheckedAt?: string | null;
  checkedBy?: string | null;
}): boolean {
  return Boolean(
    source.officialSourceUrl &&
      /^https:\/\//i.test(source.officialSourceUrl) &&
      source.sourceCheckedAt &&
      source.checkedBy,
  );
}

export function countVerifiedSources(pack: Pick<AccountingRulePack, "sources">): number {
  return (pack.sources ?? []).filter(isSourceVerified).length;
}

function push(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  field: string,
  message: string,
) {
  issues.push({ code, severity, field, message });
}

function validateCategories(pack: AccountingRulePack, issues: ValidationIssue[]) {
  const categories: ExpenseCategoryRule[] = pack.expenseCategories ?? [];
  if (categories.length === 0) {
    push(issues, "blocking", "categories_empty", "expenseCategories", "Rule pack har ingen udgiftskategorier.");
    return;
  }

  const seen = new Map<string, number>();
  for (const category of categories) {
    seen.set(category.categoryCode, (seen.get(category.categoryCode) ?? 0) + 1);

    if (!category.categoryCode || !/^[a-z0-9_]+$/.test(category.categoryCode)) {
      push(issues, "blocking", "category_code_invalid", `expenseCategories.${category.categoryCode}`, `Ugyldig category code “${category.categoryCode}”. Brug små bogstaver, tal og underscore.`);
    }
    if (!category.localTitle?.trim()) {
      push(issues, "blocking", "category_title_missing", `expenseCategories.${category.categoryCode}`, `Kategorien “${category.categoryCode}” mangler et lokalt navn.`);
    }
    if (!category.description?.trim()) {
      push(issues, "warning", "category_description_missing", `expenseCategories.${category.categoryCode}`, `Kategorien “${category.categoryCode}” mangler en beskrivelse til provideren.`);
    }
    if ((category.allowedRegistrationTypes ?? []).length === 0) {
      push(issues, "blocking", "category_registration_types_missing", `expenseCategories.${category.categoryCode}`, `Kategorien “${category.categoryCode}” angiver ingen tilladte registreringstyper.`);
    }
    if (!category.indirectTaxTreatment) {
      push(issues, "blocking", "category_tax_treatment_missing", `expenseCategories.${category.categoryCode}`, `Kategorien “${category.categoryCode}” mangler behandling af indirekte skat.`);
    }
    if (
      category.treatment === "partially_allowed" &&
      (category.maximumDeductiblePercentage === null ||
        category.maximumDeductiblePercentage === undefined)
    ) {
      push(issues, "blocking", "category_missing_max_percentage", `expenseCategories.${category.categoryCode}`, `Kategorien “${category.categoryCode}” er delvist fradragsberettiget, men mangler en maksimal procent.`);
    }
    if (
      category.maximumDeductiblePercentage !== null &&
      category.maximumDeductiblePercentage !== undefined &&
      (category.maximumDeductiblePercentage < 0 || category.maximumDeductiblePercentage > 100)
    ) {
      push(issues, "blocking", "category_percentage_out_of_range", `expenseCategories.${category.categoryCode}`, `Maksimal procent for “${category.categoryCode}” skal være mellem 0 og 100.`);
    }
    if (!category.officialGuidanceReference) {
      push(issues, "warning", "category_reference_missing", `expenseCategories.${category.categoryCode}`, `Kategorien “${category.categoryCode}” har ingen henvisning til officiel vejledning.`);
    }
    if ((category.aiKeywords ?? []).length === 0) {
      push(issues, "recommendation", "category_ai_keywords_missing", `expenseCategories.${category.categoryCode}`, `Tilføj AI keywords til “${category.categoryCode}” for bedre automatisk forslag.`);
    }
  }

  for (const [code, count] of seen) {
    if (count > 1) {
      push(issues, "blocking", "category_duplicate", `expenseCategories.${code}`, `Kategorikoden “${code}” findes ${count} gange.`);
    }
  }
}

function validateIndirectTax(pack: AccountingRulePack, issues: ValidationIssue[]) {
  if (!pack.indirectTaxEnabled) {
    if (pack.indirectTaxSystem) {
      push(issues, "warning", "indirect_tax_disabled_with_system", "indirectTaxSystem", "Indirekte skat er slået fra, men der er valgt et skattesystem.");
    }
    return;
  }
  if (!pack.indirectTaxName?.trim()) {
    push(issues, "blocking", "indirect_tax_name_missing", "indirectTaxName", "Indirekte skat er aktiveret, men navnet (fx VAT, IVA, GST) mangler.");
  }
  if (!pack.indirectTaxSystem) {
    push(issues, "blocking", "indirect_tax_system_missing", "indirectTaxSystem", "Vælg om systemet fungerer som VAT eller som sales tax.");
  }
  const rates = [
    ...(pack.defaultIndirectTaxRates ?? []),
    ...(pack.reducedIndirectTaxRates ?? []),
    ...(pack.zeroRateRules ?? []),
  ];
  if ((pack.defaultIndirectTaxRates ?? []).length === 0) {
    push(issues, "blocking", "indirect_tax_standard_rate_missing", "defaultIndirectTaxRates", "Der mangler en standardsats.");
  }
  const codes = new Set<string>();
  for (const rate of rates) {
    if (codes.has(rate.taxCode)) {
      push(issues, "blocking", "tax_code_duplicate", `taxRates.${rate.taxCode}`, `Skattekoden “${rate.taxCode}” findes flere gange.`);
    }
    codes.add(rate.taxCode);
    if (!Number.isInteger(rate.rateBasisPoints)) {
      push(issues, "blocking", "tax_rate_not_integer", `taxRates.${rate.taxCode}`, `Satsen for “${rate.taxCode}” skal angives i hele basispoint.`);
    }
    if (rate.rateBasisPoints < 0 || rate.rateBasisPoints > 10000) {
      push(issues, "blocking", "tax_rate_out_of_range", `taxRates.${rate.taxCode}`, `Satsen for “${rate.taxCode}” skal være mellem 0 og 10000 basispoint.`);
    }
  }
  if ((pack.reverseChargeRules ?? []).length === 0) {
    push(issues, "recommendation", "reverse_charge_missing", "reverseChargeRules", "Overvej at beskrive reverse charge for grænseoverskridende køb.");
  }
}

function validateMileage(pack: AccountingRulePack, issues: ValidationIssue[]) {
  const m = pack.mileageRules;
  if (!m || !m.method) {
    push(issues, "blocking", "mileage_method_missing", "mileageRules.method", "Vælg en metode for kørsel.");
    return;
  }
  if (m.method === "fixed_rate" || m.method === "mixed_method") {
    if (!m.distanceUnit) {
      push(issues, "blocking", "mileage_unit_missing", "mileageRules.distanceUnit", "Fast sats kræver en afstandsenhed (km eller mile).");
    }
    if (!m.currency) {
      push(issues, "blocking", "mileage_currency_missing", "mileageRules.currency", "Fast sats kræver en valuta.");
    }
    if ((m.rateBands ?? []).length === 0) {
      push(issues, "blocking", "mileage_bands_missing", "mileageRules.rateBands", "Fast sats kræver mindst ét satsinterval.");
    }
    for (const band of m.rateBands ?? []) {
      if (!Number.isInteger(band.minorPerDistanceUnit)) {
        push(issues, "blocking", "mileage_rate_not_integer", "mileageRules.rateBands", `Satsen for “${band.vehicleType}” skal være hele minor units.`);
      }
      if (band.toDistance !== null && band.toDistance <= band.fromDistance) {
        push(issues, "blocking", "mileage_band_invalid", "mileageRules.rateBands", `Intervallet for “${band.vehicleType}” slutter før det starter.`);
      }
    }
  }
  if ((m.documentationRequirements ?? []).length === 0) {
    push(issues, "warning", "mileage_documentation_missing", "mileageRules.documentationRequirements", "Beskriv hvilken dokumentation der kræves for kørsel.");
  }
}

function validateFiling(pack: AccountingRulePack, issues: ValidationIssue[]) {
  if ((pack.filingPeriodOptions ?? []).length === 0) {
    push(issues, "blocking", "filing_periods_missing", "filingPeriodOptions", "Rule pack mangler indberetningsperioder.");
    return;
  }
  for (const kind of pack.filingPeriodOptions) {
    const deadline = (pack.filingDeadlines ?? []).find((d) => d.periodKind === kind);
    if (!deadline) {
      push(issues, "warning", "filing_deadline_missing", `filingDeadlines.${kind}`, `Perioden “${kind}” har ingen beskrevet frist.`);
    }
  }
}

function validateDates(
  pack: AccountingRulePack,
  otherPacks: AccountingRulePack[],
  issues: ValidationIssue[],
) {
  if (!ISO_DATE.test(pack.effectiveFrom ?? "")) {
    push(issues, "blocking", "effective_from_invalid", "effectiveFrom", "Startdato mangler eller er ugyldig (YYYY-MM-DD).");
  }
  if (pack.effectiveTo && !ISO_DATE.test(pack.effectiveTo)) {
    push(issues, "blocking", "effective_to_invalid", "effectiveTo", "Slutdato er ugyldig (YYYY-MM-DD).");
  }
  if (pack.effectiveTo && pack.effectiveFrom && pack.effectiveTo < pack.effectiveFrom) {
    push(issues, "blocking", "effective_range_invalid", "effectiveTo", "Slutdato ligger før startdato.");
  }

  const siblings = otherPacks.filter(
    (other) =>
      other.id !== pack.id &&
      other.countryCode === pack.countryCode &&
      (other.regionCode ?? null) === (pack.regionCode ?? null) &&
      other.status === "published",
  );
  for (const other of siblings) {
    if (other.rulePackVersion === pack.rulePackVersion) {
      push(issues, "blocking", "version_duplicate", "rulePackVersion", `Version “${pack.rulePackVersion}” findes allerede som publiceret for ${pack.countryCode}.`);
    }
    const overlaps =
      (!other.effectiveTo || !pack.effectiveFrom || pack.effectiveFrom <= other.effectiveTo) &&
      (!pack.effectiveTo || !other.effectiveFrom || other.effectiveFrom <= pack.effectiveTo);
    if (overlaps) {
      push(issues, "blocking", "effective_overlap", "effectiveFrom", `Perioden overlapper den publicerede version “${other.rulePackVersion}”.`);
    }
  }
}

function validateSources(pack: AccountingRulePack, issues: ValidationIssue[]) {
  const sources = pack.sources ?? [];
  if (sources.length === 0) {
    push(issues, "blocking", "sources_missing", "sources", "Rule pack har ingen officielle kilder.");
    return;
  }
  const verified = sources.filter(isSourceVerified);
  if (verified.length === 0) {
    push(issues, "blocking", "sources_unverified", "sources", "Mindst én kilde skal være verificeret (https-URL, kontrolleret dato og kontrolleret af).");
  }
  for (const source of sources) {
    if (source.officialSourceUrl && !/^https:\/\//i.test(source.officialSourceUrl)) {
      push(issues, "blocking", "source_url_insecure", "sources", `Kilden “${source.officialSourceName}” skal bruge en https-URL.`);
    }
    if (!source.officialSourceName?.trim()) {
      push(issues, "warning", "source_org_missing", "sources", "En kilde mangler organisation.");
    }
    if (source.sourceCheckedAt && ISO_DATE.test(source.sourceCheckedAt)) {
      const checked = new Date(`${source.sourceCheckedAt}T00:00:00Z`).getTime();
      const ageDays = (Date.now() - checked) / 86_400_000;
      if (ageDays > 365) {
        push(issues, "warning", "source_stale", "sources", `Kilden “${source.officialSourceName}” er ikke kontrolleret i over 12 måneder.`);
      }
    }
  }
}

export function validateRulePack(
  pack: AccountingRulePack,
  options: { otherPacks?: AccountingRulePack[] } = {},
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const otherPacks = options.otherPacks ?? [];

  if (!COUNTRY.test(pack.countryCode ?? "")) {
    push(issues, "blocking", "country_invalid", "countryCode", "Landekode skal være to store bogstaver (ISO 3166-1 alpha-2).");
  }
  if (!pack.rulePackVersion?.trim()) {
    push(issues, "blocking", "version_missing", "rulePackVersion", "Rule pack mangler en version.");
  }
  if (!CURRENCY.test(pack.defaultCurrency ?? "")) {
    push(issues, "blocking", "currency_missing", "defaultCurrency", "Standardvaluta mangler eller er ugyldig (ISO 4217).");
  }
  if ((pack.supportedCurrencies ?? []).length === 0) {
    push(issues, "warning", "supported_currencies_missing", "supportedCurrencies", "Ingen understøttede valutaer er angivet.");
  }
  if (!LOCALE.test(pack.defaultLocale ?? "")) {
    push(issues, "blocking", "locale_missing", "defaultLocale", "Standard-locale mangler eller er ugyldig (fx da-DK).");
  }
  if ((pack.supportedRegistrationTypes ?? []).length === 0) {
    push(issues, "blocking", "registration_types_missing", "supportedRegistrationTypes", "Rule pack angiver ingen registreringstyper.");
  }
  if ((pack.disclaimers ?? []).length === 0) {
    push(issues, "blocking", "disclaimers_missing", "disclaimers", "Rule pack mangler ansvarsfraskrivelse.");
  }

  const labels = pack.labels;
  const requiredLabels: (keyof typeof labels)[] = [
    "businessRegistrationLabel",
    "indirectTaxLabel",
    "indirectTaxNumberLabel",
    "taxIdentificationLabel",
    "filingPeriodLabel",
    "preliminaryAmountLabel",
  ];
  for (const key of requiredLabels) {
    if (!labels || !String(labels[key] ?? "").trim()) {
      push(issues, "blocking", "label_missing", `labels.${String(key)}`, `Oversættelsen “${String(key)}” mangler.`);
    }
  }
  for (const type of pack.supportedRegistrationTypes ?? []) {
    if (!labels?.registrationTypeLabels?.[type]) {
      push(issues, "warning", "registration_label_missing", `labels.registrationTypeLabels.${type}`, `Registreringstypen “${type}” har ingen lokal oversættelse.`);
    }
  }

  if (!pack.mixedUseRules) {
    push(issues, "blocking", "mixed_use_missing", "mixedUseRules", "Regler for blandet brug mangler.");
  } else if (
    pack.mixedUseRules.maximumBusinessUsePercentage !== null &&
    (pack.mixedUseRules.maximumBusinessUsePercentage < 0 ||
      pack.mixedUseRules.maximumBusinessUsePercentage > 100)
  ) {
    push(issues, "blocking", "mixed_use_percentage_invalid", "mixedUseRules.maximumBusinessUsePercentage", "Maksimal erhvervsandel skal være mellem 0 og 100.");
  }
  if (pack.mixedUseRules && (pack.mixedUseRules.categoriesRequiringReview ?? []).length === 0) {
    push(issues, "recommendation", "review_rules_missing", "mixedUseRules.categoriesRequiringReview", "Ingen kategorier er markeret til manuel kontrol.");
  }
  if ((pack.receiptRequirements ?? []).length === 0) {
    push(issues, "warning", "documentation_missing", "receiptRequirements", "Dokumentationskrav til bilag er ikke beskrevet.");
  }
  if (pack.sampleOnly) {
    push(issues, "blocking", "sample_only", "sampleOnly", "Pakken er markeret som testdata og kan ikke publiceres.");
  }

  validateCategories(pack, issues);
  validateIndirectTax(pack, issues);
  validateMileage(pack, issues);
  validateFiling(pack, issues);
  validateDates(pack, otherPacks, issues);
  validateSources(pack, issues);

  const blockingErrors = issues.filter((i) => i.severity === "blocking");
  return {
    issues,
    blockingErrors,
    warnings: issues.filter((i) => i.severity === "warning"),
    recommendations: issues.filter((i) => i.severity === "recommendation"),
    verifiedSourceCount: countVerifiedSources(pack),
    hasBlockingErrors: blockingErrors.length > 0,
  };
}

export interface PublishCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PublishReadiness {
  ready: boolean;
  checks: PublishCheck[];
  report: ValidationReport;
}

/** Hard gate. `ready` false means the Publish button must be disabled. */
export function evaluatePublishReadiness(
  pack: AccountingRulePack,
  options: { otherPacks?: AccountingRulePack[]; today?: string } = {},
): PublishReadiness {
  const report = validateRulePack(pack, options);
  const others = (options.otherPacks ?? []).filter(
    (o) =>
      o.id !== pack.id &&
      o.countryCode === pack.countryCode &&
      (o.regionCode ?? null) === (pack.regionCode ?? null) &&
      o.status === "published",
  );

  const overlapping = others.some(
    (other) =>
      other.rulePackVersion === pack.rulePackVersion ||
      ((!other.effectiveTo || pack.effectiveFrom <= other.effectiveTo) &&
        (!pack.effectiveTo || other.effectiveFrom <= pack.effectiveTo)),
  );

  const validDate = ISO_DATE.test(pack.effectiveFrom ?? "") &&
    (!pack.effectiveTo || (ISO_DATE.test(pack.effectiveTo) && pack.effectiveTo >= pack.effectiveFrom));

  const requiredFilled =
    COUNTRY.test(pack.countryCode ?? "") &&
    Boolean(pack.rulePackVersion?.trim()) &&
    CURRENCY.test(pack.defaultCurrency ?? "") &&
    LOCALE.test(pack.defaultLocale ?? "") &&
    (pack.supportedRegistrationTypes ?? []).length > 0 &&
    (pack.expenseCategories ?? []).length > 0 &&
    (pack.filingPeriodOptions ?? []).length > 0 &&
    (pack.disclaimers ?? []).length > 0;

  const checks: PublishCheck[] = [
    {
      id: "no_blocking_errors",
      label: "Ingen blocking errors",
      passed: !report.hasBlockingErrors,
      detail: report.hasBlockingErrors
        ? `${report.blockingErrors.length} blokerende fejl skal rettes.`
        : "Validatoren fandt ingen blokerende fejl.",
    },
    {
      id: "verified_source",
      label: "Mindst én verificeret kilde",
      passed: report.verifiedSourceCount > 0,
      detail: `${report.verifiedSourceCount} verificeret(e) kilde(r).`,
    },
    {
      id: "no_overlap",
      label: "Ingen overlappende version",
      passed: !overlapping,
      detail: overlapping
        ? "En publiceret version dækker allerede denne periode."
        : "Ingen konflikt med publicerede versioner.",
    },
    {
      id: "valid_effective_date",
      label: "Gyldig effective date",
      passed: validDate,
      detail: validDate ? `Gælder fra ${pack.effectiveFrom}.` : "Datointervallet er ugyldigt.",
    },
    {
      id: "required_fields",
      label: "Alle obligatoriske felter udfyldt",
      passed: requiredFilled,
      detail: requiredFilled ? "Alle nøglefelter er sat." : "Der mangler obligatoriske felter.",
    },
  ];

  return { ready: checks.every((c) => c.passed), checks, report };
}

/** A published pack whose effectiveTo is in the past is expired. */
export function isRulePackExpired(pack: AccountingRulePack, today = new Date().toISOString().slice(0, 10)): boolean {
  return pack.status === "published" && Boolean(pack.effectiveTo) && pack.effectiveTo! < today;
}
