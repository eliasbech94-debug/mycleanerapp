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
  const summary = result.indirectTax;
  if (!summary) return null;
  const ccy = result.accountingCurrency;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{summary.label}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Feltstrukturen følger skattesystemet i regelversion {rulePack.rulePackVersion}.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          {summary.system === "vat_like" ? (
            <>
              <Line label="Udgående skat" value={formatMinor(summary.outputTaxMinor ?? 0, ccy, locale)} />
              <Line label="Indgående skat" value={formatMinor(summary.inputTaxMinor ?? 0, ccy, locale)} />
              <Line label="Reguleringer" value={formatMinor(summary.adjustmentsMinor ?? 0, ccy, locale)} />
              <Line
                label="Anslået beløb at betale"
                value={formatMinor(result.indirectTaxPayableMinor ?? 0, ccy, locale)}
              />
              <Line
                label="Anslået beløb til gode"
                value={formatMinor(result.indirectTaxReceivableMinor ?? 0, ccy, locale)}
              />
            </>
          ) : (
            <>
              <Line label="Skattepligtigt salg" value={formatMinor(summary.taxableSalesMinor ?? 0, ccy, locale)} />
              <Line label="Opkrævet sales tax" value={formatMinor(summary.salesTaxCollectedMinor ?? 0, ccy, locale)} />
              <Line label="Fritaget salg" value={formatMinor(summary.exemptSalesMinor ?? 0, ccy, locale)} />
              <Line label="Lokal skattejurisdiktion" value={summary.localTaxJurisdiction ?? "—"} />
              <Line
                label="Anslået sales tax-forpligtelse"
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
