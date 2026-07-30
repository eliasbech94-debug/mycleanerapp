import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AccountingRulePack, ProviderRegistrationType } from "@/lib/accounting";

const TREATMENT_LABEL: Record<string, string> = {
  generally_allowed: "Kan normalt medregnes",
  partially_allowed: "Kan delvist medregnes",
  capital_asset: "Behandles som anlægsaktiv",
  special_review: "Kræver særlig vurdering",
  generally_disallowed: "Kan normalt ikke medregnes",
};

export default function DeductionGuide({
  rulePack,
  registrationType,
}: {
  rulePack: AccountingRulePack;
  registrationType: ProviderRegistrationType | null;
}) {
  const categories = rulePack.expenseCategories.filter(
    (cat) => !registrationType || cat.allowedRegistrationTypes.includes(registrationType),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Hvad kan jeg registrere?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Genereret ud fra regelversion {rulePack.rulePackVersion} for {rulePack.countryCode},
          gældende fra {rulePack.effectiveFrom}
          {rulePack.effectiveTo ? ` til ${rulePack.effectiveTo}` : ""}.
          {rulePack.verifiedAt ? ` Senest verificeret ${rulePack.verifiedAt}.` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Der er ingen kategorier for din registreringsform i det aktive regelsæt.
          </p>
        )}
        {categories.map((cat) => (
          <div key={cat.categoryCode} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground">{cat.localTitle}</h3>
              <Badge variant="outline">{TREATMENT_LABEL[cat.treatment] ?? cat.treatment}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{cat.description}</p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {cat.maximumDeductiblePercentage != null && (
                <li>Højst {cat.maximumDeductiblePercentage} % kan medregnes.</li>
              )}
              {cat.businessUseRequired && <li>Erhvervsmæssig andel skal angives.</li>}
              {cat.documentationRequired && <li>Dokumentation kræves.</li>}
              {cat.localConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
              {cat.warningText && <li className="text-destructive">{cat.warningText}</li>}
              {cat.officialGuidanceReference && <li>Kilde: {cat.officialGuidanceReference}</li>}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
