import type {
  AccountingPeriod,
  AccountingRulePack,
  JurisdictionResolution,
  ProviderAccountingProfile,
} from "./types";

export const JURISDICTION_RESOLVER_VERSION = "jurisdiction-resolver-1.0.0";

/** A pack with no expense categories and no tax rates cannot govern anything. */
export function isRulePackEmpty(pack: AccountingRulePack): boolean {
  const hasCategories = pack.expenseCategories.length > 0;
  const hasTaxRules =
    !pack.indirectTaxEnabled ||
    pack.defaultIndirectTaxRates.length > 0 ||
    pack.zeroRateRules.length > 0;
  const hasFiling = pack.filingPeriodOptions.length > 0;
  return !(hasCategories && hasTaxRules && hasFiling);
}

export function isRulePackVerified(pack: AccountingRulePack): boolean {
  return (
    pack.sources.length > 0 &&
    pack.sources.some((source) => Boolean(source.officialSourceUrl && source.sourceCheckedAt)) &&
    Boolean(pack.verifiedAt) &&
    Boolean(pack.verifiedBy)
  );
}

function coversDate(pack: AccountingRulePack, isoDate: string): boolean {
  if (pack.effectiveFrom > isoDate) return false;
  if (pack.effectiveTo && pack.effectiveTo < isoDate) return false;
  return true;
}

export interface ResolveJurisdictionArgs {
  taxResidenceCountry: string | null;
  registrationCountry: string | null;
  primaryWorkCountry: string | null;
  serviceCountry?: string | null;
  accountingPeriod: AccountingPeriod;
  availableRulePacks: AccountingRulePack[];
}

/**
 * Deterministic, backend-owned jurisdiction resolution.
 *
 * The frontend never picks between candidate countries. When the provider's
 * verified data points at more than one country, the period is flagged for
 * manual review instead of guessing.
 */
export function resolveAccountingJurisdiction(
  args: ResolveJurisdictionArgs,
): JurisdictionResolution {
  const { accountingPeriod, availableRulePacks } = args;

  // A closed period is bound to the rule pack frozen at close time.
  if (accountingPeriod.status === "closed" && accountingPeriod.frozenRulePackId) {
    const frozen = availableRulePacks.find((p) => p.id === accountingPeriod.frozenRulePackId);
    if (frozen) {
      return {
        status: "resolved",
        jurisdictionCode: accountingPeriod.frozenJurisdictionCode || frozen.countryCode,
        countryCode: frozen.countryCode,
        regionCode: frozen.regionCode,
        rulePackId: frozen.id,
        rulePackVersion: accountingPeriod.frozenRulePackVersion || frozen.rulePackVersion,
        effectiveFrom: frozen.effectiveFrom,
        effectiveTo: frozen.effectiveTo,
        currency: accountingPeriod.frozenAccountingCurrency || frozen.defaultCurrency,
        locale: frozen.defaultLocale,
      };
    }
  }

  const candidates = Array.from(
    new Set(
      [
        args.taxResidenceCountry,
        args.registrationCountry,
        args.primaryWorkCountry,
        args.serviceCountry ?? null,
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toUpperCase()),
    ),
  );

  if (candidates.length === 0) {
    return {
      status: "requires_review",
      reasonCode: "missing_country",
      candidateCountries: [],
      message: "Land eller registrering mangler",
    };
  }

  if (candidates.length > 1) {
    return {
      status: "requires_review",
      reasonCode: "conflicting_countries",
      candidateCountries: candidates,
      message: "Landeregler kræver kontrol",
    };
  }

  const countryCode = candidates[0];
  // Rule pack lookup is always driven by the period date, never by now().
  const lookupDate = accountingPeriod.periodEnd;
  const forCountry = availableRulePacks.filter((pack) => pack.countryCode === countryCode);

  if (forCountry.length === 0) {
    return {
      status: "requires_review",
      reasonCode: "no_rule_pack",
      candidateCountries: candidates,
      message: "Automatisk vejledning er endnu ikke tilgængelig for dette land.",
    };
  }

  const published = forCountry.filter((pack) => pack.status === "published");
  if (published.length === 0) {
    return {
      status: "requires_review",
      reasonCode: "rule_pack_not_published",
      candidateCountries: candidates,
      message: "Automatisk vejledning er endnu ikke tilgængelig for dette land.",
    };
  }

  const effective = published
    .filter((pack) => coversDate(pack, lookupDate))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  if (effective.length === 0) {
    return {
      status: "requires_review",
      reasonCode: "rule_pack_not_effective",
      candidateCountries: candidates,
      message: "Landeregler kræver kontrol",
    };
  }

  const pack = effective[0];
  if (isRulePackEmpty(pack) || !isRulePackVerified(pack)) {
    return {
      status: "requires_review",
      reasonCode: "rule_pack_empty",
      candidateCountries: candidates,
      message: "Landeregler kræver kontrol",
    };
  }

  return {
    status: "resolved",
    jurisdictionCode: pack.regionCode ? `${pack.countryCode}-${pack.regionCode}` : pack.countryCode,
    countryCode: pack.countryCode,
    regionCode: pack.regionCode,
    rulePackId: pack.id,
    rulePackVersion: pack.rulePackVersion,
    effectiveFrom: pack.effectiveFrom,
    effectiveTo: pack.effectiveTo,
    currency: pack.defaultCurrency,
    locale: pack.defaultLocale,
  };
}

/** Registration type support is a per-country question, never a global one. */
export function isRegistrationTypeSupported(
  pack: AccountingRulePack,
  profile: ProviderAccountingProfile,
): boolean {
  if (!profile.registrationType) return false;
  return pack.supportedRegistrationTypes.includes(profile.registrationType);
}

/** The indirect-tax module is shown only when both rules and profile require it. */
export function showIndirectTaxModule(
  pack: AccountingRulePack | null,
  profile: ProviderAccountingProfile,
): boolean {
  if (!pack) return false;
  if (!pack.indirectTaxEnabled) return false;
  if (profile.indirectTaxRegistered !== true) return false;
  return pack.supportedIndirectTaxTypes.includes(profile.indirectTaxType);
}
