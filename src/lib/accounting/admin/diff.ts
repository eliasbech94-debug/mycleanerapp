/**
 * Rule Pack Manager — version comparison.
 *
 * Pure and side-effect free so the diff shown to an administrator is exactly
 * what the tests assert on.
 */

import type { AccountingRulePack, ExpenseCategoryRule, IndirectTaxRateRule } from "../types";

export type DiffKind = "added" | "removed" | "changed";

export interface RulePackDiffEntry {
  group:
    | "general"
    | "rates"
    | "categories"
    | "mixed_use"
    | "mileage"
    | "documentation"
    | "filing"
    | "ai"
    | "sources"
    | "disclaimers";
  kind: DiffKind;
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface RulePackDiff {
  from: { id: string; countryCode: string; rulePackVersion: string };
  to: { id: string; countryCode: string; rulePackVersion: string };
  entries: RulePackDiffEntry[];
  countsByGroup: Record<string, number>;
  identical: boolean;
  crossCountry: boolean;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(tom)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function scalar(
  entries: RulePackDiffEntry[],
  group: RulePackDiffEntry["group"],
  field: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  const a = str(before);
  const b = str(after);
  if (a === b) return;
  entries.push({ group, kind: "changed", field, label, before: a, after: b });
}

function rateMap(pack: AccountingRulePack): Map<string, IndirectTaxRateRule> {
  const map = new Map<string, IndirectTaxRateRule>();
  for (const rate of [
    ...(pack.defaultIndirectTaxRates ?? []),
    ...(pack.reducedIndirectTaxRates ?? []),
    ...(pack.zeroRateRules ?? []),
    ...(pack.reverseChargeRules ?? []),
  ]) {
    map.set(rate.taxCode, rate);
  }
  return map;
}

function categoryMap(pack: AccountingRulePack): Map<string, ExpenseCategoryRule> {
  return new Map((pack.expenseCategories ?? []).map((c) => [c.categoryCode, c]));
}

export function compareRulePacks(from: AccountingRulePack, to: AccountingRulePack): RulePackDiff {
  const entries: RulePackDiffEntry[] = [];

  scalar(entries, "general", "countryCode", "Land", from.countryCode, to.countryCode);
  scalar(entries, "general", "regionCode", "Region", from.regionCode, to.regionCode);
  scalar(entries, "general", "status", "Status", from.status, to.status);
  scalar(entries, "general", "effectiveFrom", "Gælder fra", from.effectiveFrom, to.effectiveFrom);
  scalar(entries, "general", "effectiveTo", "Gælder til", from.effectiveTo, to.effectiveTo);
  scalar(entries, "general", "defaultCurrency", "Valuta", from.defaultCurrency, to.defaultCurrency);
  scalar(entries, "general", "defaultLocale", "Locale", from.defaultLocale, to.defaultLocale);
  scalar(entries, "general", "supportedRegistrationTypes", "Registreringstyper", from.supportedRegistrationTypes, to.supportedRegistrationTypes);
  scalar(entries, "general", "indirectTaxName", "Navn på indirekte skat", from.indirectTaxName, to.indirectTaxName);
  scalar(entries, "general", "indirectTaxSystem", "Skattesystem", from.indirectTaxSystem, to.indirectTaxSystem);

  // Rates
  const fromRates = rateMap(from);
  const toRates = rateMap(to);
  for (const [code, rate] of toRates) {
    const previous = fromRates.get(code);
    if (!previous) {
      entries.push({ group: "rates", kind: "added", field: `rate.${code}`, label: `Ny sats “${code}”`, before: null, after: `${rate.rateBasisPoints} bp` });
    } else if (
      previous.rateBasisPoints !== rate.rateBasisPoints ||
      previous.exempt !== rate.exempt ||
      previous.reverseCharge !== rate.reverseCharge
    ) {
      entries.push({
        group: "rates",
        kind: "changed",
        field: `rate.${code}`,
        label: `Sats “${code}”`,
        before: `${previous.rateBasisPoints} bp`,
        after: `${rate.rateBasisPoints} bp`,
      });
    }
  }
  for (const [code, rate] of fromRates) {
    if (!toRates.has(code)) {
      entries.push({ group: "rates", kind: "removed", field: `rate.${code}`, label: `Fjernet sats “${code}”`, before: `${rate.rateBasisPoints} bp`, after: null });
    }
  }

  // Categories
  const fromCats = categoryMap(from);
  const toCats = categoryMap(to);
  for (const [code, category] of toCats) {
    const previous = fromCats.get(code);
    if (!previous) {
      entries.push({ group: "categories", kind: "added", field: `category.${code}`, label: `Ny kategori “${category.localTitle}”`, before: null, after: category.treatment });
      continue;
    }
    const fields: [keyof ExpenseCategoryRule, string][] = [
      ["localTitle", "navn"],
      ["treatment", "behandling"],
      ["indirectTaxTreatment", "skattebehandling"],
      ["maximumDeductiblePercentage", "maks. procent"],
      ["documentationRequired", "dokumentationskrav"],
      ["businessUseRequired", "krav om erhvervsandel"],
      ["allowedRegistrationTypes", "registreringstyper"],
      ["requiresManualReview", "manuel kontrol"],
      ["capitalAsset", "driftsmiddel"],
    ];
    for (const [key, label] of fields) {
      const a = str(previous[key]);
      const b = str(category[key]);
      if (a !== b) {
        entries.push({
          group: key === "documentationRequired" ? "documentation" : "categories",
          kind: "changed",
          field: `category.${code}.${String(key)}`,
          label: `${category.localTitle}: ${label}`,
          before: a,
          after: b,
        });
      }
    }
    const beforeKeywords = str(previous.aiKeywords ?? []);
    const afterKeywords = str(category.aiKeywords ?? []);
    if (beforeKeywords !== afterKeywords) {
      entries.push({ group: "ai", kind: "changed", field: `category.${code}.aiKeywords`, label: `${category.localTitle}: AI keywords`, before: beforeKeywords, after: afterKeywords });
    }
  }
  for (const [code, category] of fromCats) {
    if (!toCats.has(code)) {
      entries.push({ group: "categories", kind: "removed", field: `category.${code}`, label: `Slettet kategori “${category.localTitle}”`, before: category.treatment, after: null });
    }
  }

  scalar(entries, "mixed_use", "mixedUseRules.maximumBusinessUsePercentage", "Maks. erhvervsandel", from.mixedUseRules?.maximumBusinessUsePercentage, to.mixedUseRules?.maximumBusinessUsePercentage);
  scalar(entries, "mixed_use", "mixedUseRules.categoriesRequiringReview", "Kategorier til kontrol", from.mixedUseRules?.categoriesRequiringReview, to.mixedUseRules?.categoriesRequiringReview);
  scalar(entries, "mixed_use", "mixedUseRules.categoriesDisallowed", "Ikke tilladte kategorier", from.mixedUseRules?.categoriesDisallowed, to.mixedUseRules?.categoriesDisallowed);

  scalar(entries, "mileage", "mileageRules.method", "Kørselsmetode", from.mileageRules?.method, to.mileageRules?.method);
  scalar(entries, "mileage", "mileageRules.distanceUnit", "Afstandsenhed", from.mileageRules?.distanceUnit, to.mileageRules?.distanceUnit);
  const fromBands = (from.mileageRules?.rateBands ?? []).map((b) => `${b.vehicleType}:${b.fromDistance}-${b.toDistance ?? "∞"}=${b.minorPerDistanceUnit}`);
  const toBands = (to.mileageRules?.rateBands ?? []).map((b) => `${b.vehicleType}:${b.fromDistance}-${b.toDistance ?? "∞"}=${b.minorPerDistanceUnit}`);
  scalar(entries, "mileage", "mileageRules.rateBands", "Satsintervaller", fromBands, toBands);

  scalar(entries, "documentation", "receiptRequirements", "Bilagskrav", from.receiptRequirements, to.receiptRequirements);
  scalar(entries, "documentation", "invoiceRequirements", "Fakturakrav", from.invoiceRequirements, to.invoiceRequirements);
  scalar(entries, "documentation", "recordRetentionRules", "Opbevaringskrav", from.recordRetentionRules, to.recordRetentionRules);

  scalar(entries, "filing", "filingPeriodOptions", "Indberetningsperioder", from.filingPeriodOptions, to.filingPeriodOptions);
  scalar(entries, "disclaimers", "disclaimers", "Ansvarsfraskrivelser", from.disclaimers, to.disclaimers);
  scalar(entries, "sources", "sources", "Kilder", (from.sources ?? []).map((s) => s.officialSourceName), (to.sources ?? []).map((s) => s.officialSourceName));

  const countsByGroup: Record<string, number> = {};
  for (const entry of entries) {
    countsByGroup[entry.group] = (countsByGroup[entry.group] ?? 0) + 1;
  }

  return {
    from: { id: from.id, countryCode: from.countryCode, rulePackVersion: from.rulePackVersion },
    to: { id: to.id, countryCode: to.countryCode, rulePackVersion: to.rulePackVersion },
    entries,
    countsByGroup,
    identical: entries.length === 0,
    crossCountry: from.countryCode !== to.countryCode,
  };
}

export function summarizeDiff(diff: RulePackDiff): string {
  if (diff.identical) return "Ingen forskelle mellem de to versioner.";
  const added = diff.entries.filter((e) => e.kind === "added").length;
  const removed = diff.entries.filter((e) => e.kind === "removed").length;
  const changed = diff.entries.filter((e) => e.kind === "changed").length;
  return `${added} tilføjet, ${changed} ændret, ${removed} fjernet.`;
}
