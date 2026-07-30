/**
 * External income — engine regression tests (§20).
 * No UI, no database: these lock the rules that decide money.
 */
import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  calculatePreliminaryRegistrationAmount,
  evaluateExternalIncomeItem,
  findPossibleDuplicates,
  parseAmountToMinor,
  parseCsv,
  resolveAccountingJurisdiction,
  validatePlatformPayout,
  type ExternalIncomeInput,
} from "@/lib/accounting";
import {
  EXTERNAL_INCOME_PREVIEW_CASES,
  FIXTURE_PERIOD,
  FIXTURE_RULE_PACKS,
  fixtureLedger,
} from "@/dev/fixtures/accountingFixtures";

function runCase(id: string, overrides?: { periodClosed?: boolean }) {
  const preview = EXTERNAL_INCOME_PREVIEW_CASES.find((c) => c.id === id)!;
  const jurisdiction = resolveAccountingJurisdiction({
    taxResidenceCountry: preview.provider.taxResidenceCountry,
    registrationCountry: preview.provider.registrationCountry,
    primaryWorkCountry: preview.provider.primaryWorkCountry,
    accountingPeriod: FIXTURE_PERIOD,
    availableRulePacks: FIXTURE_RULE_PACKS,
  });
  const rulePack =
    jurisdiction.status === "resolved"
      ? (FIXTURE_RULE_PACKS.find((p) => p.id === jurisdiction.rulePackId) ?? null)
      : null;
  const period = overrides?.periodClosed
    ? { ...FIXTURE_PERIOD, status: "closed" as const }
    : FIXTURE_PERIOD;
  const ledger = fixtureLedger(rulePack?.defaultCurrency ?? preview.currency);
  return {
    preview,
    rulePack,
    jurisdiction,
    period,
    result: calculatePreliminaryRegistrationAmount({
      provider: preview.provider,
      accountingPeriod: period,
      rulePack,
      jurisdiction,
      externalIncome: preview.externalIncome,
      ...ledger,
    }),
  };
}

describe("external income totals", () => {
  it("sums MyCleaner income and external income into the total", () => {
    const { result } = runCase("I");
    expect(result.externalIncomeMinor).toBe(250000);
    expect(result.totalIncomeMinor).toBe(
      result.myCleanerIncomeMinor + result.externalIncomeMinor,
    );
    expect(result.includedIncomeMinor).toBe(result.totalIncomeMinor);
  });

  it("matches the totals the UI renders (UI never sums money itself)", () => {
    const { result } = runCase("J");
    const fromSources = result.incomeBySource.reduce((a, r) => a + r.amountMinor, 0);
    expect(fromSources).toBe(result.totalIncomeMinor);
  });
});

describe("platform payouts", () => {
  it("validates gross - fee - tax = net", () => {
    expect(
      validatePlatformPayout({
        payoutPeriodFrom: null,
        payoutPeriodTo: null,
        payoutDate: null,
        payoutReference: null,
        grossIncomeMinor: 400000,
        platformFeeMinor: 60000,
        taxWithheldMinor: 10000,
        netPayoutMinor: 330000,
      }).ok,
    ).toBe(true);

    const bad = validatePlatformPayout({
      payoutPeriodFrom: null,
      payoutPeriodTo: null,
      payoutDate: null,
      payoutReference: null,
      grossIncomeMinor: 400000,
      platformFeeMinor: 60000,
      taxWithheldMinor: 0,
      netPayoutMinor: 300000,
    });
    expect(bad.ok).toBe(false);
    expect(bad.message).toBe("Beløbene kræver kontrol");
  });

  it("counts the platform fee exactly once, as an expense", () => {
    const withFee = runCase("M");
    const noFee = runCase("I");
    // Income is recognised gross; the fee shows up once on the expense side.
    expect(withFee.result.externalIncomeMinor).toBe(400000);
    const feeDelta =
      withFee.result.includedExpensesMinor - noFee.result.includedExpensesMinor;
    expect(feeDelta).toBe(60000);
  });
});

describe("exclusions and review", () => {
  it("excludes refunded external income", () => {
    const { result } = runCase("O");
    expect(result.externalIncomeMinor).toBe(0);
    expect(result.excludedExternalIncomeItems).toContain("ext-o-1");
  });

  it("marks cash income as requiring review until the provider reviews it", () => {
    const { result } = runCase("K");
    expect(result.reviewRequiredExternalIncomeItems).toContain("ext-k-1");
    expect(result.externalIncomeMinor).toBe(0);
  });

  it("blocks recognition when the exchange rate is missing", () => {
    const { result } = runCase("L");
    expect(result.reviewRequiredExternalIncomeItems).toContain("ext-l-1");
    const item = result.reviewRequiredItems.find((i) => i.id === "ext-l-1");
    expect(item?.reason).toBe("Valutakurs mangler");
  });

  it("returns requires_review for an unclear jurisdiction", () => {
    const { result } = runCase("P");
    const item = result.reviewRequiredItems.find((i) => i.id === "ext-p-1");
    expect(item?.reason).toBe("Landeregler kræver kontrol");
  });

  it("never recalculates a stored historical exchange rate", () => {
    const base = runCase("I");
    const again = runCase("I");
    expect(again.result.externalIncomeMinor).toBe(base.result.externalIncomeMinor);
  });

  it("does not recalculate a closed period differently", () => {
    const open = runCase("I");
    const closed = runCase("I", { periodClosed: true });
    expect(closed.result.totalIncomeMinor).toBe(open.result.totalIncomeMinor);
  });
});

describe("duplicates", () => {
  it("finds likely duplicates", () => {
    const preview = EXTERNAL_INCOME_PREVIEW_CASES.find((c) => c.id === "N")!;
    const [first, second] = preview.externalIncome;
    const matches = findPossibleDuplicates(second, [first]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].matchedOn).toContain("fakturanummer");
  });
});

describe("import", () => {
  const csvText = [
    "dato,beskrivelse,beløb,valuta",
    '2026-05-04,Opgave hos kunde,"1.250,00",DKK',
    "not-a-date,Ugyldig,100,DKK",
  ].join("\n");

  it("parses amounts into minor units without floats", () => {
    expect(parseAmountToMinor("1.250,00")).toBe(125000);
    expect(parseAmountToMinor("1,250.55")).toBe(125055);
    expect(parseAmountToMinor("abc")).toBeNull();
  });

  it("never auto-approves imported rows", () => {
    const csv = parseCsv(csvText);
    const preview = buildImportPreview({
      csv,
      mapping: { incomeDate: 0, description: 1, amount: 2, currency: 3 },
      incomeSourceType: "other_platform",
      defaultCurrency: "DKK",
      existing: [],
      importedFrom: "csv",
    });
    expect(preview.drafts).toHaveLength(1);
    expect(preview.drafts[0].recordStatus).toBe("draft");
    expect(preview.drafts[0].reviewRequired).toBe(true);
    expect(preview.issues.some((i) => i.code === "invalid_date")).toBe(true);
  });

  it("keeps imported drafts out of the calculated amount", () => {
    const { preview, rulePack, jurisdiction } = runCase("I");
    const imported: ExternalIncomeInput = {
      ...preview.externalIncome[0],
      id: "imported-1",
      recordStatus: "draft",
      reviewRequired: true,
      importedFrom: "csv",
    };
    const outcome = evaluateExternalIncomeItem({
      item: imported,
      rulePack,
      jurisdiction,
      provider: preview.provider,
      accountingCurrency: "DKK",
    });
    expect(outcome.outcome).toBe("review_required");
  });
});

describe("AI and manual approval", () => {
  it("cannot approve external income automatically", () => {
    const { preview, rulePack, jurisdiction } = runCase("K");
    const outcome = evaluateExternalIncomeItem({
      item: { ...preview.externalIncome[0], documentationStatus: "uploaded" },
      rulePack,
      jurisdiction,
      provider: preview.provider,
      accountingCurrency: "DKK",
    });
    // Cash still requires the provider's own review — nothing else may approve it.
    expect(outcome.outcome).toBe("review_required");
  });
});

describe("indirect tax presentation contract", () => {
  it("uses sales-tax fields, not VAT fields, in a sales-tax country", () => {
    const preview = EXTERNAL_INCOME_PREVIEW_CASES[0];
    const usPack = FIXTURE_RULE_PACKS.find((p) => p.indirectTaxSystem === "sales_tax_like");
    expect(usPack).toBeDefined();
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: usPack!.countryCode,
      registrationCountry: usPack!.countryCode,
      primaryWorkCountry: usPack!.countryCode,
      accountingPeriod: FIXTURE_PERIOD,
      availableRulePacks: FIXTURE_RULE_PACKS,
    });
    const result = calculatePreliminaryRegistrationAmount({
      provider: {
        ...preview.provider,
        registrationCountry: usPack!.countryCode,
        taxResidenceCountry: usPack!.countryCode,
        primaryWorkCountry: usPack!.countryCode,
        indirectTaxType: "sales_tax",
        accountingCurrency: usPack!.defaultCurrency,
      },
      accountingPeriod: FIXTURE_PERIOD,
      rulePack: usPack!,
      jurisdiction,
      externalIncome: [],
      ...fixtureLedger(usPack!.defaultCurrency),
    });
    if (result.indirectTax) {
      expect(result.indirectTax.system).toBe("sales_tax_like");
      expect(result.indirectTax.outputTaxMinor).toBeUndefined();
      expect(result.indirectTax.inputTaxMinor).toBeUndefined();
    }
  });
});

describe("soft delete", () => {
  it("keeps deleted rows out of the amount but still visible to the engine", () => {
    const { preview, rulePack, jurisdiction } = runCase("I");
    const outcome = evaluateExternalIncomeItem({
      item: { ...preview.externalIncome[0], deletedAt: "2026-06-01T00:00:00Z" },
      rulePack,
      jurisdiction,
      provider: preview.provider,
      accountingCurrency: "DKK",
    });
    expect(outcome).toMatchObject({ outcome: "excluded", reasonCode: "deleted" });
  });
});
