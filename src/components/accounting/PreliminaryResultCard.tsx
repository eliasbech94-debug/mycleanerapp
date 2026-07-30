import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMinor, type CalculationResult } from "@/lib/accounting";

const STATUS_LABEL: Record<CalculationResult["status"], string> = {
  ready_for_review: "Klar til gennemgang",
  missing_documentation: "Mangler bilag",
  rules_require_review: "Regler kræver kontrol",
  missing_country_or_registration: "Land eller registrering mangler",
  cannot_calculate: "Kan ikke beregnes",
};

export default function PreliminaryResultCard({
  result,
  locale,
  amountLabel,
}: {
  result: CalculationResult;
  locale: string | null;
  amountLabel: string;
}) {
  const amount = result.preliminaryAmountToRegisterMinor;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{amountLabel}</CardTitle>
          <div className="flex gap-2">
            <Badge variant={result.status === "ready_for_review" ? "secondary" : "destructive"}>
              {STATUS_LABEL[result.status]}
            </Badge>
            <Badge variant="outline">Ikke en automatisk indberetning</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {amount == null ? (
          <p className="text-2xl font-semibold text-foreground">Beløbet kan endnu ikke beregnes</p>
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-foreground">
            {formatMinor(amount, result.accountingCurrency, locale)}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          Beregnet efter de aktive regnskabsregler for dit registreringsland.
        </p>

        {amount != null && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Figure label="Indtægter" value={formatMinor(result.includedIncomeMinor, result.accountingCurrency, locale)} />
            <Figure label="Udgifter" value={formatMinor(result.includedExpensesMinor, result.accountingCurrency, locale)} />
            <Figure label="Kørsel" value={formatMinor(result.includedMileageAmountMinor, result.accountingCurrency, locale)} />
          </div>
        )}

        {result.warnings.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-medium text-foreground">Sådan er beløbet beregnet</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {result.explanationLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        {(result.reviewRequiredItems.length > 0 || result.excludedItems.length > 0) && (
          <div className="mt-4 space-y-3">
            {result.reviewRequiredItems.length > 0 && (
              <ItemList title="Kræver manuel kontrol" items={result.reviewRequiredItems} />
            )}
            {result.excludedItems.length > 0 && (
              <ItemList title="Ikke medregnet" items={result.excludedItems} />
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Beregningsversion {result.calculationVersion}
          {result.rulePackVersion ? ` · regelversion ${result.rulePackVersion}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: CalculationResult["excludedItems"] }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item.id}>
            <span className="text-foreground">{item.label}</span> — {item.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
