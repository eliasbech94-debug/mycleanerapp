import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AccountingRulePack, ProviderRegistrationType } from "@/lib/accounting";

export default function DeductionGuide({
  rulePack,
  registrationType,
}: {
  rulePack: AccountingRulePack;
  registrationType: ProviderRegistrationType | null;
}) {
  const { t } = useTranslation("finance");
  const TREATMENT_LABEL: Record<string, string> = {
    generally_allowed: t("ui.deductionGuide.treatment.generally_allowed"),
    partially_allowed: t("ui.deductionGuide.treatment.partially_allowed"),
    capital_asset: t("ui.deductionGuide.treatment.capital_asset"),
    special_review: t("ui.deductionGuide.treatment.special_review"),
    generally_disallowed: t("ui.deductionGuide.treatment.generally_disallowed"),
  };

  const categories = rulePack.expenseCategories.filter(
    (cat) => !registrationType || cat.allowedRegistrationTypes.includes(registrationType),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("ui.deductionGuide.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("ui.deductionGuide.generatedFrom", {
            version: rulePack.rulePackVersion,
            country: rulePack.countryCode,
            from: rulePack.effectiveFrom,
          })}
          {rulePack.effectiveTo ? t("ui.deductionGuide.effectiveToSuffix", { to: rulePack.effectiveTo }) : ""}
          {rulePack.verifiedAt ? t("ui.deductionGuide.lastVerifiedSuffix", { date: rulePack.verifiedAt }) : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("ui.deductionGuide.noCategories")}
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
                <li>{t("ui.deductionGuide.maxPercentage", { percentage: cat.maximumDeductiblePercentage })}</li>
              )}
              {cat.businessUseRequired && <li>{t("ui.deductionGuide.businessUseRequired")}</li>}
              {cat.documentationRequired && <li>{t("ui.deductionGuide.documentationRequired")}</li>}
              {cat.localConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
              {cat.warningText && <li className="text-destructive">{cat.warningText}</li>}
              {cat.officialGuidanceReference && <li>{t("ui.deductionGuide.source", { reference: cat.officialGuidanceReference })}</li>}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
