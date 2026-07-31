import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor, type CalculationResult, type AccountingRulePack } from "@/lib/accounting";

export default function IndirectTaxPanel({
  result,
  rulePack,
  locale,
}: {
  result: CalculationResult;
  rulePack: AccountingRulePack;
  locale: string | null;
}) {
  const { t } = useTranslation("finance");
  const summary = result.indirectTax;
  if (!summary) return null;
  const ccy = result.accountingCurrency;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{summary.label}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("ui.indirectTax.fieldStructureNote", { version: rulePack.rulePackVersion })}
        </p>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          {summary.system === "vat_like" ? (
            <>
              <Line label={t("ui.indirectTax.outputTax")} value={formatMinor(summary.outputTaxMinor ?? 0, ccy, locale)} />
              <Line label={t("ui.indirectTax.inputTax")} value={formatMinor(summary.inputTaxMinor ?? 0, ccy, locale)} />
              <Line label={t("ui.indirectTax.adjustments")} value={formatMinor(summary.adjustmentsMinor ?? 0, ccy, locale)} />
              <Line
                label={t("ui.indirectTax.estimatedPayable")}
                value={formatMinor(result.indirectTaxPayableMinor ?? 0, ccy, locale)}
              />
              <Line
                label={t("ui.indirectTax.estimatedReceivable")}
                value={formatMinor(result.indirectTaxReceivableMinor ?? 0, ccy, locale)}
              />
            </>
          ) : (
            <>
              <Line label={t("ui.indirectTax.taxableSales")} value={formatMinor(summary.taxableSalesMinor ?? 0, ccy, locale)} />
              <Line label={t("ui.indirectTax.salesTaxCollected")} value={formatMinor(summary.salesTaxCollectedMinor ?? 0, ccy, locale)} />
              <Line label={t("ui.indirectTax.exemptSales")} value={formatMinor(summary.exemptSalesMinor ?? 0, ccy, locale)} />
              <Line label={t("ui.indirectTax.localTaxJurisdiction")} value={summary.localTaxJurisdiction ?? t("ui.indirectTax.notAvailable")} />
              <Line
                label={t("ui.indirectTax.estimatedLiability")}
                value={formatMinor(summary.estimatedLiabilityMinor ?? 0, ccy, locale)}
              />
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
