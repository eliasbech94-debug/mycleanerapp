import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AccountingRulePack,
  JurisdictionResolution,
  ProviderAccountingProfile,
} from "@/lib/accounting";

interface Props {
  provider: ProviderAccountingProfile;
  rulePack: AccountingRulePack | null;
  jurisdiction: JurisdictionResolution;
  onOpenRules: () => void;
  onCheckDetails?: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function JurisdictionCard({
  provider,
  rulePack,
  jurisdiction,
  onOpenRules,
  onCheckDetails,
}: Props) {
  const { t } = useTranslation("finance");
  const resolved = jurisdiction.status === "resolved" ? jurisdiction : null;
  const registrationLabel =
    (provider.registrationType &&
      rulePack?.labels.registrationTypeLabels[provider.registrationType]) ||
    provider.registrationType ||
    t("ui.jurisdiction.notProvided");

  const indirectTaxLabel = !rulePack?.indirectTaxEnabled
    ? t("ui.jurisdiction.indirectTaxNotRelevant")
    : provider.indirectTaxRegistered === true
      ? t("ui.jurisdiction.registeredWithLabel", { label: rulePack.labels.indirectTaxLabel })
      : provider.indirectTaxRegistered === false
        ? t("ui.jurisdiction.notRegistered")
        : t("ui.jurisdiction.unknownRequiresReview");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{t("ui.jurisdiction.title")}</CardTitle>
          {resolved ? (
            <Badge variant="secondary">{resolved.rulePackVersion}</Badge>
          ) : (
            <Badge variant="destructive">{t("ui.jurisdiction.requiresReview")}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          <Row
            label={t("ui.jurisdiction.country")}
            value={
              resolved?.countryCode ??
              (jurisdiction.status === "requires_review" && jurisdiction.candidateCountries.length > 0
                ? jurisdiction.candidateCountries.join(", ")
                : t("ui.jurisdiction.notProvided"))
            }
          />
          <Row label={t("ui.jurisdiction.registration")} value={String(registrationLabel)} />
          <Row label={t("ui.jurisdiction.indirectTax")} value={indirectTaxLabel} />
          <Row label={t("ui.jurisdiction.rulePackVersion")} value={resolved?.rulePackVersion ?? "—"} />
          <Row label={t("ui.jurisdiction.currency")} value={resolved?.currency ?? provider.accountingCurrency ?? "—"} />
        </div>

        {jurisdiction.status === "requires_review" && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {jurisdiction.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCheckDetails}>
            {t("ui.jurisdiction.checkDetails")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenRules}>
            {t("ui.jurisdiction.seeRules")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
