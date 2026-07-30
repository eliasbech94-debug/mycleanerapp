/**
 * Rule Pack Manager — preview and sandbox runner.
 *
 * The sandbox never persists anything. It builds an in-memory scenario, runs
 * it through the exact same calculation engine providers use, and can run the
 * same scenario against several rule packs for comparison.
 */

import {
  calculatePreliminaryRegistrationAmount,
  type AccountingPeriod,
  type AccountingRulePack,
  type CalculationResult,
  type ExpenseInput,
  type IncomeInput,
  type JurisdictionResolution,
  type MileageInput,
  type ProviderAccountingProfile,
  type ProviderRegistrationType,
} from "../index";

export interface SandboxScenario {
  label: string;
  countryCode: string;
  registrationType: ProviderRegistrationType;
  indirectTaxRegistered: boolean;
  currency: string;
  period: AccountingPeriod;
  income: IncomeInput[];
  expenses: ExpenseInput[];
  mileage: MileageInput[];
}

export interface SandboxRun {
  rulePackId: string;
  rulePackLabel: string;
  result: CalculationResult;
}

function scenarioProvider(scenario: SandboxScenario): ProviderAccountingProfile {
  return {
    providerUserId: "sandbox",
    registrationCountry: scenario.countryCode,
    taxResidenceCountry: scenario.countryCode,
    primaryWorkCountry: scenario.countryCode,
    registrationType: scenario.registrationType,
    businessRegistrationNumberLast4: null,
    businessRegistrationType: null,
    taxIdentificationNumberLast4: null,
    taxIdentificationType: null,
    indirectTaxRegistered: scenario.indirectTaxRegistered,
    indirectTaxType: scenario.indirectTaxRegistered ? "vat" : "none",
    indirectTaxNumberLast4: null,
    accountingCurrency: scenario.currency,
    preferredLocale: null,
    profileRequiresReview: false,
  };
}

function jurisdictionFor(pack: AccountingRulePack): JurisdictionResolution {
  return {
    status: "resolved",
    jurisdictionCode: pack.regionCode ? `${pack.countryCode}-${pack.regionCode}` : pack.countryCode,
    countryCode: pack.countryCode,
    regionCode: pack.regionCode,
    rulePackVersion: pack.rulePackVersion,
    rulePackId: pack.id,
    effectiveFrom: pack.effectiveFrom,
    effectiveTo: pack.effectiveTo,
    currency: pack.defaultCurrency,
    locale: pack.defaultLocale,
  };
}

/** Runs a scenario against one rule pack. Nothing is written anywhere. */
export function runSandboxScenario(
  scenario: SandboxScenario,
  pack: AccountingRulePack,
): SandboxRun {
  const result = calculatePreliminaryRegistrationAmount({
    provider: scenarioProvider(scenario),
    accountingPeriod: scenario.period,
    rulePack: pack,
    jurisdiction: jurisdictionFor(pack),
    income: scenario.income,
    expenses: scenario.expenses,
    mileage: scenario.mileage,
    adjustments: [],
  });
  return {
    rulePackId: pack.id,
    rulePackLabel: `${pack.countryCode} ${pack.rulePackVersion}`,
    result,
  };
}

export function runSandboxAcrossPacks(
  scenario: SandboxScenario,
  packs: AccountingRulePack[],
): SandboxRun[] {
  return packs.map((pack) => runSandboxScenario(scenario, pack));
}

export interface CsvParseResult<T> {
  rows: T[];
  errors: string[];
}

function splitCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(";").flatMap((cell) => cell.split(",")).map((c) => c.trim()));
}

/**
 * Minimal CSV import for sandbox expenses:
 * `label,date,amountMinor,currency,categoryCode,businessUsePct,hasDocumentation`
 */
export function parseExpenseCsv(text: string, accountingCurrency: string): CsvParseResult<ExpenseInput> {
  const rows: ExpenseInput[] = [];
  const errors: string[] = [];
  const lines = splitCsv(text);
  lines.forEach((cells, index) => {
    if (index === 0 && /label/i.test(cells[0] ?? "")) return;
    if (cells.length < 4) {
      errors.push(`Linje ${index + 1}: for få kolonner.`);
      return;
    }
    const [label, date, amount, currency, categoryCode, businessUse, documented] = cells;
    const amountMinor = Number(amount);
    if (!Number.isInteger(amountMinor)) {
      errors.push(`Linje ${index + 1}: beløb skal være hele minor units.`);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      errors.push(`Linje ${index + 1}: ugyldig dato.`);
      return;
    }
    if (currency !== accountingCurrency) {
      errors.push(`Linje ${index + 1}: valuta ${currency} kræver en vekselkurs og springes over.`);
      return;
    }
    rows.push({
      id: `csv-${index}`,
      label: label || `Bilag ${index}`,
      transactionDate: date,
      originalAmountMinor: amountMinor,
      originalCurrency: currency,
      accountingAmountMinor: amountMinor,
      accountingCurrency,
      exchangeRate: "1.0000000000",
      exchangeRateDate: date,
      exchangeRateSource: "sandbox",
      categoryCode: categoryCode || null,
      merchantCountry: null,
      businessUsePercentage: businessUse ? Number(businessUse) : null,
      taxCodeHint: null,
      hasDocumentation: documented !== "false",
      aiSuggested: false,
      approvedByProvider: true,
    });
  });
  return { rows, errors };
}

/** `label,date,amountMinor,currency,platformFeeMinor` */
export function parseIncomeCsv(text: string, accountingCurrency: string): CsvParseResult<IncomeInput> {
  const rows: IncomeInput[] = [];
  const errors: string[] = [];
  splitCsv(text).forEach((cells, index) => {
    if (index === 0 && /label/i.test(cells[0] ?? "")) return;
    const [label, date, amount, currency, fee] = cells;
    const amountMinor = Number(amount);
    if (!Number.isInteger(amountMinor)) {
      errors.push(`Linje ${index + 1}: beløb skal være hele minor units.`);
      return;
    }
    rows.push({
      id: `csv-income-${index}`,
      label: label || `Booking ${index}`,
      transactionDate: date,
      originalAmountMinor: amountMinor,
      originalCurrency: currency || accountingCurrency,
      accountingAmountMinor: amountMinor,
      accountingCurrency,
      exchangeRate: "1.0000000000",
      exchangeRateDate: date,
      exchangeRateSource: "sandbox",
      platformFeeMinor: fee ? Number(fee) : 0,
    });
  });
  return { rows, errors };
}

/** `label,date,distance,vehicleType,tripType` */
export function parseMileageCsv(text: string): CsvParseResult<MileageInput> {
  const rows: MileageInput[] = [];
  const errors: string[] = [];
  splitCsv(text).forEach((cells, index) => {
    if (index === 0 && /label/i.test(cells[0] ?? "")) return;
    const [label, date, distance, vehicleType, tripType] = cells;
    const value = Number(distance);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`Linje ${index + 1}: ugyldig afstand.`);
      return;
    }
    rows.push({
      id: `csv-mileage-${index}`,
      label: label || `Kørsel ${index}`,
      transactionDate: date,
      distance: value,
      vehicleType: vehicleType || "car",
      tripType: (tripType as MileageInput["tripType"]) || "home_to_customer",
      hasDocumentation: true,
    });
  });
  return { rows, errors };
}
