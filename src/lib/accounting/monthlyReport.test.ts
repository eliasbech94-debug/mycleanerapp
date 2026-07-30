import { describe, expect, it } from "vitest";
import {
  buildCorrectionVersion,
  buildMonthlyReportDocument,
  buildReportFileName,
  buildReportStoragePath,
  countAttentionItems,
  deriveReportStatus,
  isMonthClosed,
  monthLabel,
  monthlyPeriod,
  reportIdempotencyKey,
  shouldGenerateReport,
  type MonthlyReportRecord,
  type MonthlyReportSnapshot,
} from "./monthlyReport";
import type { CalculationResult, ProviderAccountingProfile } from "./types";

const provider: ProviderAccountingProfile = {
  providerUserId: "p1",
  registrationCountry: "DK",
  taxResidenceCountry: "DK",
  primaryWorkCountry: "DK",
  registrationType: "sole_trader",
  businessRegistrationNumberLast4: "4821",
  businessRegistrationType: "cvr_like",
  taxIdentificationNumberLast4: null,
  taxIdentificationType: null,
  indirectTaxRegistered: true,
  indirectTaxType: "vat",
  indirectTaxNumberLast4: "4821",
  accountingCurrency: "DKK",
  preferredLocale: "da-DK",
};

function result(overrides: Partial<CalculationResult> = {}): CalculationResult {
  return {
    preliminaryAmountToRegisterMinor: 100000,
    preliminaryBusinessResultMinor: 100000,
    indirectTaxPayableMinor: null,
    indirectTaxReceivableMinor: null,
    indirectTax: null,
    includedIncomeMinor: 150000,
    includedExpensesMinor: 50000,
    includedMileageAmountMinor: 0,
    myCleanerIncomeMinor: 150000,
    externalIncomeMinor: 0,
    totalIncomeMinor: 150000,
    includedExternalIncomeItems: [],
    excludedExternalIncomeItems: [],
    reviewRequiredExternalIncomeItems: [],
    incomeBySource: [
      { sourceType: "mycleaner", sourceName: null, amountMinor: 150000, currency: "DKK" },
    ],
    excludedItems: [],
    reviewRequiredItems: [],
    calculationVersion: "1.1.0",
    rulePackVersion: null,
    jurisdictionCode: "DK",
    accountingCurrency: "DKK",
    status: "ready_for_review",
    warnings: [],
    explanationLines: ["Beregnet på baggrund af registrerede poster."],
    ...overrides,
  };
}

function snapshot(overrides: Partial<MonthlyReportSnapshot> = {}): MonthlyReportSnapshot {
  return {
    snapshotVersion: "snapshot-1.0.0",
    generatedAt: "2026-06-01T06:00:00.000Z",
    provider,
    providerDisplayName: "Test Provider",
    myCleanerId: "MC-123456",
    period: monthlyPeriod(2026, 5),
    reportYear: 2026,
    reportMonth: 5,
    rulePack: null,
    rulePackHash: null,
    jurisdictionCode: "DK",
    accountingCurrency: "DKK",
    calculationVersion: "1.1.0",
    result: result(),
    income: [],
    externalIncome: [],
    expenses: [],
    mileage: [],
    exchangeRates: [],
    ...overrides,
  };
}

describe("monthly report period helpers", () => {
  it("builds a calendar month period", () => {
    expect(monthlyPeriod(2026, 2)).toEqual({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      kind: "monthly",
      status: "open",
    });
  });

  it("handles leap years", () => {
    expect(monthlyPeriod(2028, 2).periodEnd).toBe("2028-02-29");
  });

  it("only closes a month once the next month has started", () => {
    expect(isMonthClosed(2026, 5, new Date("2026-05-31T23:00:00Z"))).toBe(false);
    expect(isMonthClosed(2026, 5, new Date("2026-06-01T00:00:00Z"))).toBe(true);
  });

  it("labels months in Danish", () => {
    expect(monthLabel(2026, 7)).toBe("Juli 2026");
  });
});

describe("file naming and storage", () => {
  it("never leaks a tax number into the file name", () => {
    const name = buildReportFileName({ year: 2026, month: 7, myCleanerId: "MC-123456" });
    expect(name).toBe("MyCleaner-regnskabsrapport-2026-07-MC-123456.pdf");
  });

  it("marks corrected versions in the file name", () => {
    expect(buildReportFileName({ year: 2026, month: 7, myCleanerId: "MC-1", version: 2 })).toContain("-v2");
  });

  it("sanitises unsafe identifier characters", () => {
    expect(buildReportFileName({ year: 2026, month: 1, myCleanerId: "../secret id" })).not.toContain("/");
  });

  it("scopes storage paths per provider, month and version", () => {
    expect(
      buildReportStoragePath({ providerId: "abc", year: 2026, month: 3, version: 2 }),
    ).toBe("abc/2026/03/v2/report.pdf");
  });
});

describe("generation rules", () => {
  it("skips empty months by default", () => {
    expect(
      shouldGenerateReport({ income: [], externalIncome: [], expenses: [], mileage: [] }),
    ).toBe(false);
  });

  it("generates empty months on explicit request", () => {
    expect(
      shouldGenerateReport(
        { income: [], externalIncome: [], expenses: [], mileage: [] },
        { generateEmptyMonths: true },
      ),
    ).toBe(true);
  });

  it("generates when any activity exists", () => {
    expect(
      shouldGenerateReport({ income: [], externalIncome: [{}], expenses: [], mileage: [] }),
    ).toBe(true);
  });

  it("derives status from the backend result only", () => {
    expect(deriveReportStatus(result())).toBe("ready");
    expect(deriveReportStatus(result({ warnings: ["mangler bilag"] }))).toBe("ready_with_warnings");
    expect(deriveReportStatus(result({ status: "cannot_calculate" }))).toBe("failed");
  });

  it("counts attention items across income and expenses", () => {
    expect(
      countAttentionItems(
        result({
          reviewRequiredExternalIncomeItems: ["a"],
          excludedExternalIncomeItems: ["b"],
        }),
      ),
    ).toBe(2);
  });

  it("supersedes instead of overwriting a corrected report", () => {
    const previous = { id: "r1", reportVersion: 1 } as MonthlyReportRecord;
    expect(buildCorrectionVersion(previous)).toEqual({ reportVersion: 2, supersedesReportId: "r1" });
  });

  it("produces a stable idempotency key", () => {
    const args = {
      providerId: "p1",
      year: 2026,
      month: 5,
      version: 1,
      kind: "scheduled_month_end" as const,
    };
    expect(reportIdempotencyKey(args)).toBe(reportIdempotencyKey(args));
    expect(reportIdempotencyKey(args)).toBe("p1:2026:05:v1:scheduled_month_end");
  });
});

describe("report document", () => {
  it("uses the generic disclaimer when no rule pack is published", () => {
    const document = buildMonthlyReportDocument({ snapshot: snapshot() });
    expect(document.disclaimer.join(" ")).toContain("ikke en automatisk skatte- eller momsindberetning");
    const rules = document.sections.find((section) => section.id === "rules");
    expect(rules?.note).toContain("Automatisk skattevejledning er ikke aktiveret");
  });

  it("never renders an indirect-tax section without a backend tax result", () => {
    const document = buildMonthlyReportDocument({ snapshot: snapshot() });
    expect(document.sections.some((section) => section.id === "indirect-tax")).toBe(false);
  });

  it("renders the backend indirect-tax figures when present", () => {
    const document = buildMonthlyReportDocument({
      snapshot: snapshot({
        result: result({
          indirectTax: {
            system: "vat_like",
            label: "Moms",
            outputTaxMinor: 37500,
            inputTaxMinor: 12500,
          },
          indirectTaxPayableMinor: 25000,
        }),
      }),
    });
    const section = document.sections.find((item) => item.id === "indirect-tax");
    expect(section?.title).toBe("Moms");
  });

  it("lists review-required and excluded items in the attention section", () => {
    const document = buildMonthlyReportDocument({
      snapshot: snapshot({
        result: result({
          reviewRequiredItems: [
            {
              id: "e1",
              kind: "expense",
              label: "Bilag mangler",
              accountingAmountMinor: 1000,
              categoryCode: null,
              reasonCode: "missing_documentation",
              reason: "dokumentation mangler",
            },
          ],
        }),
      }),
    });
    const section = document.sections.find((item) => item.id === "attention");
    expect(section?.kind).toBe("list");
    expect(JSON.stringify(section)).toContain("Bilag mangler");
  });

  it("marks provisional reports", () => {
    const document = buildMonthlyReportDocument({ snapshot: snapshot(), kind: "provisional" });
    expect(document.provisional).toBe(true);
  });

  it("records the superseded version on a correction", () => {
    const document = buildMonthlyReportDocument({
      snapshot: snapshot(),
      reportVersion: 2,
      supersedesVersion: 1,
    });
    expect(JSON.stringify(document.sections[0])).toContain("erstatter version 1");
    expect(document.fileName).toContain("-v2");
  });

  it("carries the frozen calculation version into the method section", () => {
    const document = buildMonthlyReportDocument({ snapshot: snapshot() });
    const method = document.sections.find((item) => item.id === "method");
    expect(JSON.stringify(method)).toContain("1.1.0");
  });
});
