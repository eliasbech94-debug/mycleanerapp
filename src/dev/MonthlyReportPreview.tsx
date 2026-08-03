import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReportDocumentView from "@/components/accounting/reports/ReportDocumentView";
import MonthlyReportsSection from "@/components/accounting/reports/MonthlyReportsSection";
import {
  calculatePreliminaryRegistrationAmount,
  resolveAccountingJurisdiction,
} from "@/lib/accounting";
import {
  buildMonthlyReportDocument,
  buildReportStoragePath,
  countAttentionItems,
  deriveReportStatus,
  monthlyPeriod,
  shouldGenerateReport,
  type MonthlyReportRecord,
  type MonthlyReportSnapshot,
} from "@/lib/accounting/monthlyReport";
import { FIXTURE_RULE_PACKS } from "@/dev/fixtures/accountingFixtures";
import { MONTHLY_REPORT_PREVIEW_CASES } from "@/dev/fixtures/monthlyReportFixtures";

/**
 * Development-only preview of the monthly accounting report (cases Q–Z).
 * The document is built by the exact same builder the PDF generator uses.
 */
export default function MonthlyReportPreview() {
  const [caseId, setCaseId] = useState(MONTHLY_REPORT_PREVIEW_CASES[0].id);
  const active =
    MONTHLY_REPORT_PREVIEW_CASES.find((item) => item.id === caseId) ?? MONTHLY_REPORT_PREVIEW_CASES[0];

  const model = useMemo(() => {
    const period = monthlyPeriod(active.year, active.month);
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: active.provider.taxResidenceCountry,
      registrationCountry: active.provider.registrationCountry,
      primaryWorkCountry: active.provider.primaryWorkCountry,
      accountingPeriod: period,
      availableRulePacks: FIXTURE_RULE_PACKS,
    });
    const rulePack =
      jurisdiction.status === "resolved"
        ? (FIXTURE_RULE_PACKS.find((pack) => pack.id === jurisdiction.rulePackId) ?? null)
        : null;

    const result = calculatePreliminaryRegistrationAmount({
      provider: active.provider,
      accountingPeriod: period,
      rulePack,
      jurisdiction,
      income: active.income,
      externalIncome: active.externalIncome,
      expenses: active.expenses,
      mileage: active.mileage,
      adjustments: [],
    });

    const generate = shouldGenerateReport({
      income: active.income,
      externalIncome: active.externalIncome,
      expenses: active.expenses,
      mileage: active.mileage,
    });

    const snapshot: MonthlyReportSnapshot = {
      snapshotVersion: "snapshot-1.0.0",
      generatedAt: `${period.periodEnd}T06:00:00.000Z`,
      provider: active.provider,
      providerDisplayName: "Preview Provider",
      myCleanerId: "MC-PREVIEW",
      period,
      reportYear: active.year,
      reportMonth: active.month,
      rulePack,
      rulePackHash: rulePack ? `sha256-preview-${rulePack.rulePackVersion}` : null,
      jurisdictionCode: result.jurisdictionCode,
      accountingCurrency: result.accountingCurrency,
      calculationVersion: result.calculationVersion,
      result,
      income: active.income,
      externalIncome: active.externalIncome,
      expenses: active.expenses,
      mileage: active.mileage,
      exchangeRates: active.externalIncome
        .filter((item) => item.exchangeRate)
        .map((item) => ({
          pair: `${item.originalCurrency}>${item.accountingCurrency ?? "—"}`,
          rate: item.exchangeRate as string,
          rateDate: item.exchangeRateDate,
          source: item.exchangeRateSource,
        })),
    };

    const status = deriveReportStatus(result);
    const document = buildMonthlyReportDocument({
      snapshot,
      status,
      kind: active.kind,
      reportVersion: active.reportVersion,
      supersedesVersion: active.supersedesVersion,
    });

    const record: MonthlyReportRecord = {
      id: `preview-${active.id}`,
      providerId: "preview-provider",
      reportYear: active.year,
      reportMonth: active.month,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status,
      reportKind: active.kind,
      reportVersion: active.reportVersion,
      supersedesReportId: active.supersedesVersion ? `preview-${active.id}-v1` : null,
      registrationCountry: active.provider.registrationCountry,
      jurisdictionCode: result.jurisdictionCode,
      accountingCurrency: result.accountingCurrency,
      rulePackId: rulePack?.id ?? null,
      rulePackVersion: rulePack?.rulePackVersion ?? null,
      calculationVersion: result.calculationVersion,
      totalIncomeMinor: result.totalIncomeMinor,
      preliminaryResultMinor: result.preliminaryBusinessResultMinor,
      reviewRequiredCount: countAttentionItems(result),
      pdfFileName: document.fileName,
      pdfStoragePath: buildReportStoragePath({
        providerId: "preview-provider",
        year: active.year,
        month: active.month,
        version: active.reportVersion,
      }),
      pdfSha256: null,
      pdfGeneratedAt: snapshot.generatedAt,
      generationErrorCode: null,
      generationErrorMessage: null,
      isCurrentVersion: true,
    };

    return { document, record, generate };
  }, [active]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Development preview. Alle regelpakker og beløb er fiktive testdata og ikke gældende
        lovgivning. Rapporten er ikke en officiel skatteindberetning.
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {MONTHLY_REPORT_PREVIEW_CASES.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={item.id === caseId ? "default" : "outline"}
            onClick={() => setCaseId(item.id)}
            aria-pressed={item.id === caseId}
          >
            {item.id}
          </Button>
        ))}
      </div>

      <div className="mb-4">
        <h1 className="text-sm font-medium text-foreground">{active.title}</h1>
        <p className="text-sm text-muted-foreground">{active.description}</p>
        {!model.generate && (
          <Badge variant="outline" className="mt-2">
            Ingen aktivitet — der genereres ingen automatisk rapport for denne måned
          </Badge>
        )}
      </div>

      <div className="mb-8">
        <MonthlyReportsSection
          reports={[{ record: model.record, document: model.document }]}
          locale={active.provider.preferredLocale}
        />
      </div>

      <ReportDocumentView document={model.document} />
    </main>
  );
}
