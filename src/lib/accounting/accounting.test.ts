import { describe, expect, it } from "vitest";
import {
  CALCULATION_VERSION,
  applyBasisPoints,
  calculateMileage,
  calculateMixedUseExpense,
  calculatePreliminaryRegistrationAmount,
  convertMinor,
  resolveAccountingJurisdiction,
  resolveIndirectTaxRule,
  showIndirectTaxModule,
  type AccountingPeriod,
  type AccountingRulePack,
} from "@/lib/accounting";
import {
  ACCOUNTING_PREVIEW_CASES,
  FIXTURE_PERIOD,
  FIXTURE_RULE_PACKS,
  SALES_TAX_PREVIEW_CASE,
  fixtureLedger,
} from "@/dev/fixtures/accountingFixtures";

const packs = FIXTURE_RULE_PACKS;
const caseById = (id: string) => {
  const found = [...ACCOUNTING_PREVIEW_CASES, SALES_TAX_PREVIEW_CASE].find((c) => c.id === id);
  if (!found) throw new Error(`missing fixture case ${id}`);
  return found;
};

function resolveFor(id: string, period: AccountingPeriod = FIXTURE_PERIOD, list = packs) {
  const provider = caseById(id).provider;
  return resolveAccountingJurisdiction({
    taxResidenceCountry: provider.taxResidenceCountry,
    registrationCountry: provider.registrationCountry,
    primaryWorkCountry: provider.primaryWorkCountry,
    accountingPeriod: period,
    availableRulePacks: list,
  });
}

function runFor(id: string, period: AccountingPeriod = FIXTURE_PERIOD, list = packs) {
  const provider = caseById(id).provider;
  const jurisdiction = resolveFor(id, period, list);
  const rulePack =
    jurisdiction.status === "resolved"
      ? (list.find((p) => p.id === jurisdiction.rulePackId) ?? null)
      : null;
  const ledger = fixtureLedger(rulePack?.defaultCurrency ?? caseById(id).currency);
  return {
    jurisdiction,
    rulePack,
    result: calculatePreliminaryRegistrationAmount({
      provider,
      accountingPeriod: period,
      rulePack,
      jurisdiction,
      ...ledger,
    }),
  };
}

describe("jurisdiction resolution", () => {
  it("gives a Danish provider only the Danish rule pack", () => {
    const jurisdiction = resolveFor("A");
    expect(jurisdiction.status).toBe("resolved");
    if (jurisdiction.status !== "resolved") return;
    expect(jurisdiction.countryCode).toBe("DK");
    expect(jurisdiction.rulePackVersion).toContain("DK-");
  });

  it("gives a Swedish provider only the Swedish rule pack", () => {
    const jurisdiction = resolveFor("B");
    expect(jurisdiction.status).toBe("resolved");
    if (jurisdiction.status !== "resolved") return;
    expect(jurisdiction.countryCode).toBe("SE");
    expect(jurisdiction.currency).toBe("SEK");
  });

  it("flags a provider with several relevant countries for manual review", () => {
    const jurisdiction = resolveFor("G");
    expect(jurisdiction.status).toBe("requires_review");
    if (jurisdiction.status !== "requires_review") return;
    expect(jurisdiction.reasonCode).toBe("conflicting_countries");
    expect(jurisdiction.message).toBe("Landeregler kræver kontrol");
  });

  it("flags a missing country as manual review", () => {
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: null,
      registrationCountry: null,
      primaryWorkCountry: null,
      accountingPeriod: FIXTURE_PERIOD,
      availableRulePacks: packs,
    });
    expect(jurisdiction.status).toBe("requires_review");
    if (jurisdiction.status !== "requires_review") return;
    expect(jurisdiction.reasonCode).toBe("missing_country");
  });

  it("does not select an unpublished or empty draft pack", () => {
    const draft: AccountingRulePack = {
      ...packs[0],
      id: "draft-no",
      countryCode: "NO",
      status: "draft",
      expenseCategories: [],
    };
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: "NO",
      registrationCountry: "NO",
      primaryWorkCountry: "NO",
      accountingPeriod: FIXTURE_PERIOD,
      availableRulePacks: [...packs, draft],
    });
    expect(jurisdiction.status).toBe("requires_review");
    if (jurisdiction.status !== "requires_review") return;
    expect(jurisdiction.reasonCode).toBe("rule_pack_not_published");
  });

  it("rejects a published but unverified pack", () => {
    const unverified: AccountingRulePack = {
      ...packs[0],
      id: "unverified-no",
      countryCode: "NO",
      status: "published",
      sources: [],
      verifiedAt: null,
      verifiedBy: null,
    };
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: "NO",
      registrationCountry: "NO",
      primaryWorkCountry: "NO",
      accountingPeriod: FIXTURE_PERIOD,
      availableRulePacks: [unverified],
    });
    expect(jurisdiction.status).toBe("requires_review");
    if (jurisdiction.status !== "requires_review") return;
    expect(jurisdiction.reasonCode).toBe("rule_pack_empty");
  });

  it("does not use an expired rule pack for a newer period", () => {
    const expired: AccountingRulePack = {
      ...packs[0],
      id: "expired-dk",
      effectiveTo: "2026-03-31",
    };
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: "DK",
      registrationCountry: "DK",
      primaryWorkCountry: "DK",
      accountingPeriod: FIXTURE_PERIOD,
      availableRulePacks: [expired],
    });
    expect(jurisdiction.status).toBe("requires_review");
    if (jurisdiction.status !== "requires_review") return;
    expect(jurisdiction.reasonCode).toBe("rule_pack_not_effective");
  });

  it("keeps the frozen rule pack version for a closed period", () => {
    const closed: AccountingPeriod = {
      ...FIXTURE_PERIOD,
      status: "closed",
      frozenRulePackId: packs[0].id,
      frozenRulePackVersion: "DK-FROZEN-2025.4",
      frozenJurisdictionCode: "DK",
      frozenAccountingCurrency: "DKK",
      frozenCalculationVersion: "accounting-calc-0.9.0",
    };
    const newer: AccountingRulePack = {
      ...packs[0],
      id: "dk-newer",
      rulePackVersion: "DK-FIXTURE-2027.1",
      effectiveFrom: "2026-02-01",
    };
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: "DK",
      registrationCountry: "DK",
      primaryWorkCountry: "DK",
      accountingPeriod: closed,
      availableRulePacks: [...packs, newer],
    });
    expect(jurisdiction.status).toBe("resolved");
    if (jurisdiction.status !== "resolved") return;
    // A rule change must not silently recompute a closed period.
    expect(jurisdiction.rulePackVersion).toBe("DK-FROZEN-2025.4");
  });
});

describe("country isolation and tax systems", () => {
  it("does not apply EU VAT logic to a UK provider automatically", () => {
    const { rulePack, result } = runFor("C");
    expect(rulePack?.countryCode).toBe("GB");
    expect(result.rulePackVersion).toContain("GB-");
    expect(result.indirectTax?.label).toBe("VAT");
  });

  it("treats a sales-tax country differently from a VAT country", () => {
    const { rulePack, result } = runFor("US");
    expect(rulePack?.indirectTaxSystem).toBe("sales_tax_like");
    expect(result.indirectTax?.system).toBe("sales_tax_like");
    expect(result.indirectTax?.outputTaxMinor).toBeUndefined();
    expect(result.indirectTax?.taxableSalesMinor).toBeGreaterThan(0);
    expect(result.indirectTaxReceivableMinor).toBeNull();
  });

  it("shows no automatic deduction promises for a country without a rule pack", () => {
    const { rulePack, result } = runFor("F");
    expect(rulePack).toBeNull();
    expect(result.preliminaryAmountToRegisterMinor).toBeNull();
    expect(result.status).toBe("cannot_calculate");
    expect(result.explanationLines[0]).toBe("Beløbet kan endnu ikke beregnes.");
  });

  it("shows the indirect tax module only when rules and profile both require it", () => {
    const dk = packs.find((p) => p.countryCode === "DK")!;
    expect(showIndirectTaxModule(dk, caseById("A").provider)).toBe(false); // not registered
    expect(showIndirectTaxModule(dk, caseById("H").provider)).toBe(false); // unknown status
    expect(showIndirectTaxModule(packs.find((p) => p.countryCode === "SE")!, caseById("B").provider)).toBe(true);
  });
});

describe("expenses, mixed use and mileage", () => {
  const dk = packs.find((p) => p.countryCode === "DK")!;

  it("limits mixed use to the country ceiling instead of the claimed percentage", () => {
    const outcome = calculateMixedUseExpense({
      rulePack: dk,
      expenseAmountMinor: 100000,
      businessUsePercentage: 100,
      categoryCode: "phone",
      registrationType: "sole_trader",
      hasDocumentation: true,
    });
    expect(outcome.outcome).toBe("limited");
    expect(outcome.appliedPercentage).toBe(50);
    expect(outcome.deductibleAmountMinor).toBe(50000);
    expect(outcome.reason).toContain("begrænset");
  });

  it("never marks a category as globally fully deductible without the rule pack", () => {
    const outcome = calculateMixedUseExpense({
      rulePack: dk,
      expenseAmountMinor: 100000,
      businessUsePercentage: 100,
      categoryCode: "unknown_category",
      registrationType: "sole_trader",
      hasDocumentation: true,
    });
    expect(outcome.outcome).toBe("review_required");
    expect(outcome.deductibleAmountMinor).toBe(0);
  });

  it("follows the country mileage method and trip treatment", () => {
    const allowed = calculateMileage({
      rulePack: dk,
      accumulatedDistance: 0,
      trip: {
        id: "t1",
        label: "Kunde → kunde",
        transactionDate: "2026-04-14",
        distance: 10,
        vehicleType: "car",
        tripType: "customer_to_customer",
        hasDocumentation: true,
      },
    });
    expect(allowed.outcome).toBe("allowed");
    expect(allowed.amountMinor).toBe(3000);

    const commuting = calculateMileage({
      rulePack: dk,
      accumulatedDistance: 0,
      trip: {
        id: "t2",
        label: "Pendling",
        transactionDate: "2026-04-14",
        distance: 10,
        vehicleType: "car",
        tripType: "commuting",
        hasDocumentation: true,
      },
    });
    expect(commuting.outcome).toBe("not_allowed");

    const unsupported = calculateMileage({
      rulePack: { ...dk, mileageRules: { ...dk.mileageRules, method: "not_supported" } },
      accumulatedDistance: 0,
      trip: {
        id: "t3",
        label: "Hjem → kunde",
        transactionDate: "2026-04-14",
        distance: 10,
        vehicleType: "car",
        tripType: "home_to_customer",
        hasDocumentation: true,
      },
    });
    expect(unsupported.outcome).toBe("not_supported");
  });

  it("sends cross-border receipts with unknown treatment to review", () => {
    const rule = resolveIndirectTaxRule({
      rulePack: { ...dk, reverseChargeRules: [] },
      transactionDate: "2026-04-14",
      serviceCountry: "DK",
      expenseCategory: "software",
      merchantCountry: "IE",
    });
    expect(rule.status).toBe("review_required");
    expect(rule.reason).toContain("Skattebehandlingen kræver kontrol");
  });
});

describe("calculation guarantees", () => {
  it("never lets AI approve a receipt on its own", () => {
    const { result } = runFor("A");
    const aiItem = result.reviewRequiredItems.find((item) => item.id === "exp-4");
    expect(aiItem?.reasonCode).toBe("ai_suggestion_unconfirmed");
  });

  it("reports the applied country and rule version", () => {
    const { result } = runFor("E");
    expect(result.jurisdictionCode).toBe("ES");
    expect(result.rulePackVersion).toContain("ES-");
    expect(result.calculationVersion).toBe(CALCULATION_VERSION);
    expect(result.explanationLines.join(" ")).toContain("regelversion");
  });

  it("shows local terminology from the rule pack, not hardcoded strings", () => {
    const es = packs.find((p) => p.countryCode === "ES")!;
    const gb = packs.find((p) => p.countryCode === "GB")!;
    expect(es.labels.indirectTaxLabel).toBe("IVA");
    expect(es.labels.businessRegistrationLabel).toBe("NIF");
    expect(gb.labels.businessRegistrationLabel).toBe("Company number");
  });

  it("blocks calculation for a profile migrated from legacy data", () => {
    const provider = { ...caseById("A").provider, profileRequiresReview: true };
    const jurisdiction = resolveFor("A");
    const result = calculatePreliminaryRegistrationAmount({
      provider,
      accountingPeriod: FIXTURE_PERIOD,
      rulePack: packs[0],
      jurisdiction,
      ...fixtureLedger("DKK"),
    });
    expect(result.preliminaryAmountToRegisterMinor).toBeNull();
    expect(result.status).toBe("missing_country_or_registration");
  });

  it("excludes amounts that are not converted to the accounting currency", () => {
    const jurisdiction = resolveFor("A");
    const ledger = fixtureLedger("DKK");
    ledger.income[0] = { ...ledger.income[0], accountingCurrency: "EUR" };
    const result = calculatePreliminaryRegistrationAmount({
      provider: caseById("A").provider,
      accountingPeriod: FIXTURE_PERIOD,
      rulePack: packs[0],
      jurisdiction,
      ...ledger,
    });
    expect(result.excludedItems.some((i) => i.reasonCode === "currency_mismatch")).toBe(true);
  });
});

describe("money handling", () => {
  it("converts with a stored decimal rate reproducibly, half-up", () => {
    expect(convertMinor(10000, "7.4512")).toBe(74512);
    expect(convertMinor(1, "0.5")).toBe(1);
    expect(convertMinor(1, "0.4")).toBe(0);
    expect(convertMinor(-10000, "2.0")).toBe(-20000);
  });

  it("applies basis points without floating point drift", () => {
    expect(applyBasisPoints(333333, 2500)).toBe(83333);
    expect(applyBasisPoints(100, 1500)).toBe(15);
  });

  it("rejects malformed exchange rates instead of guessing", () => {
    expect(() => convertMinor(100, "abc")).toThrow();
    expect(() => convertMinor(100, "1.00000000001")).toThrow();
  });

  it("keeps exchange rate, date and source on every converted item", () => {
    const ledger = fixtureLedger("DKK");
    for (const item of [...ledger.income, ...ledger.expenses]) {
      expect(item.exchangeRate).toBeTruthy();
      expect(item.exchangeRateDate).toBeTruthy();
      expect(item.exchangeRateSource).toBeTruthy();
    }
  });
});
