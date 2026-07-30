import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import JurisdictionCard from "./JurisdictionCard";
import PreliminaryResultCard from "./PreliminaryResultCard";
import DeductionGuide from "./DeductionGuide";
import IndirectTaxPanel from "./IndirectTaxPanel";
import CountryRulesDialog from "./CountryRulesDialog";
import AccountingDisclaimer from "./AccountingDisclaimer";
import IncomeTab from "./income/IncomeTab";
import MonthlyReportsSection, {
  type MonthlyReportListItem,
} from "./reports/MonthlyReportsSection";
import type { MonthlyReportRecord } from "@/lib/accounting/monthlyReport";
import {
  formatMinor,
  showIndirectTaxModule,
  type AccountingPeriod,
  type AccountingRulePack,
  type CalculationResult,
  type ExternalIncomeInput,
  type JurisdictionResolution,
  type ProviderAccountingProfile,
} from "@/lib/accounting";

export interface AccountingViewProps {
  provider: ProviderAccountingProfile;
  rulePack: AccountingRulePack | null;
  jurisdiction: JurisdictionResolution;
  period: AccountingPeriod;
  /** Result is produced by the authoritative backend calculation. */
  result: CalculationResult;
  /** Month view figures, also produced by the backend. */
  monthlySummary?: { label: string; amountMinor: number }[];
  /** Manually registered income from outside MyCleaner. */
  externalIncome?: ExternalIncomeInput[];
  /** Monthly PDF reports produced by the backend generator. */
  monthlyReports?: MonthlyReportListItem[];
  reportsLoading?: boolean;
  reportsUnavailableReason?: string | null;
  onDownloadReport?: (record: MonthlyReportRecord) => void;
  downloadingReportId?: string | null;
  onCreateExternalIncome?: (item: ExternalIncomeInput) => void;
  onImportExternalIncome?: (items: ExternalIncomeInput[]) => void;
  onCheckDetails?: () => void;
}


/**
 * Presentation only. This component never computes a legal outcome and never
 * builds an explanation — it renders what the authoritative calculation
 * returned.
 */
export default function AccountingView({
  provider,
  rulePack,
  jurisdiction,
  period,
  result,
  monthlySummary,
  externalIncome = [],
  monthlyReports = [],
  reportsLoading = false,
  reportsUnavailableReason = null,
  onDownloadReport,
  downloadingReportId = null,
  onCreateExternalIncome,
  onImportExternalIncome,
  onCheckDetails,
}: AccountingViewProps) {
  const [showSuperseded, setShowSuperseded] = useState(false);

  const [rulesOpen, setRulesOpen] = useState(false);
  const locale = rulePack?.defaultLocale ?? provider.preferredLocale ?? null;

  const showIndirectTax = useMemo(
    () => showIndirectTaxModule(rulePack, provider),
    [rulePack, provider],
  );

  const monthDiffersFromFiling = period.kind !== "monthly";
  const amountLabel = rulePack?.labels.preliminaryAmountLabel ?? "Foreløbigt beløb til registrering";


  return (
    <div className="space-y-4">
      {rulePack?.sampleOnly && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Testdata: regelpakken er en fiktiv preview-pakke og må ikke bruges til indberetning.
        </div>
      )}

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dit regnskab</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Få overblik over indtjening, udgifter, transport og relevante skatter efter reglerne for
          dit registreringsland.
        </p>
      </header>

      <JurisdictionCard
        provider={provider}
        rulePack={rulePack}
        jurisdiction={jurisdiction}
        onOpenRules={() => setRulesOpen(true)}
        onCheckDetails={onCheckDetails}
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Oversigt</TabsTrigger>
          <TabsTrigger value="income">Indkomst</TabsTrigger>
          <TabsTrigger value="reports">Rapporter</TabsTrigger>
        </TabsList>


        <TabsContent value="overview" className="mt-4 space-y-4">
          <PreliminaryResultCard result={result} locale={locale} amountLabel={amountLabel} />

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Perioder</CardTitle>
                {rulePack && (
                  <Badge variant="outline">
                    {rulePack.labels.filingPeriodLabel}: {period.kind}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <h3 className="font-medium text-foreground">Aktuel indberetningsperiode</h3>
                <p className="text-muted-foreground">
                  {period.periodStart} – {period.periodEnd}
                  {period.status === "closed" ? " (lukket)" : ""}
                </p>
              </div>
              {monthDiffersFromFiling && (
                <div>
                  <h3 className="font-medium text-foreground">Månedsoversigt</h3>
                  <p className="text-muted-foreground">
                    Månedstal er kun et overblik og er ikke nødvendigvis en officiel
                    indberetningsperiode.
                  </p>
                  {monthlySummary && monthlySummary.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {monthlySummary.map((row) => (
                        <li key={row.label} className="flex justify-between">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-medium text-foreground">
                            {formatMinor(row.amountMinor, result.accountingCurrency, locale)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {showIndirectTax && rulePack && (
            <IndirectTaxPanel result={result} rulePack={rulePack} locale={locale} />
          )}

          {rulePack ? (
            <DeductionGuide rulePack={rulePack} registrationType={provider.registrationType} />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hvad kan jeg registrere?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>Bilagsopsamling og eksport understøttes.</p>
                <p>Automatisk skattevejledning er endnu ikke aktiveret.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="income" className="mt-4">
          <IncomeTab
            provider={provider}
            rulePack={rulePack}
            period={period}
            result={result}
            externalIncome={externalIncome}
            locale={locale}
            onCreate={onCreateExternalIncome}
            onImport={onImportExternalIncome}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <MonthlyReportsSection
            reports={monthlyReports}
            loading={reportsLoading}
            unavailableReason={reportsUnavailableReason}
            locale={locale}
            onDownload={onDownloadReport}
            downloadingId={downloadingReportId}
            showSuperseded={showSuperseded}
            onToggleSuperseded={setShowSuperseded}
          />
        </TabsContent>
      </Tabs>


      <AccountingDisclaimer extra={rulePack?.disclaimers} />


      <CountryRulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rulePack={rulePack}
        provider={provider}
        jurisdiction={jurisdiction}
      />
    </div>
  );
}
