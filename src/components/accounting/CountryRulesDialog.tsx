import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AccountingRulePack,
  JurisdictionResolution,
  ProviderAccountingProfile,
} from "@/lib/accounting";

export default function CountryRulesDialog({
  open,
  onOpenChange,
  rulePack,
  provider,
  jurisdiction,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  rulePack: AccountingRulePack | null;
  provider: ProviderAccountingProfile;
  jurisdiction: JurisdictionResolution;
}) {
  const { t } = useTranslation("finance");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ui.countryRules.title")}</DialogTitle>
          <DialogDescription>
            {t("ui.countryRules.description")}
          </DialogDescription>
        </DialogHeader>

        {!rulePack ? (
          <p className="text-sm text-muted-foreground">
            {jurisdiction.status === "requires_review"
              ? jurisdiction.message
              : t("ui.countryRules.noActiveRulePack")}
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <dl className="divide-y divide-border">
              <Line label={t("ui.countryRules.activeCountry")} value={`${rulePack.countryCode}${rulePack.regionCode ? `-${rulePack.regionCode}` : ""}`} />
              <Line label={t("ui.countryRules.registrationType")} value={provider.registrationType ?? t("ui.countryRules.notProvided")} />
              <Line
                label={t("ui.countryRules.indirectTaxStatus")}
                value={
                  provider.indirectTaxRegistered === true
                    ? t("ui.countryRules.registeredWithLabel", { label: rulePack.labels.indirectTaxLabel })
                    : provider.indirectTaxRegistered === false
                      ? t("ui.countryRules.notRegistered")
                      : t("ui.countryRules.unknown")
                }
              />
              <Line label={t("ui.countryRules.rulePackVersion")} value={rulePack.rulePackVersion} />
              <Line label={t("ui.countryRules.validFrom")} value={rulePack.effectiveFrom} />
              <Line label={t("ui.countryRules.validTo")} value={rulePack.effectiveTo ?? t("ui.countryRules.noEndDate")} />
              <Line label={t("ui.countryRules.lastVerified")} value={rulePack.verifiedAt ?? t("ui.countryRules.notVerified")} />
            </dl>

            <div>
              <h3 className="font-medium text-foreground">{t("ui.countryRules.officialSources")}</h3>
              <ul className="mt-1 space-y-2">
                {rulePack.sources.map((source) => (
                  <li key={source.officialSourceUrl} className="text-muted-foreground">
                    <a
                      className="text-foreground underline underline-offset-2"
                      href={source.officialSourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {source.officialSourceName}
                    </a>
                    {source.sourceDocumentTitle ? ` — ${source.sourceDocumentTitle}` : ""}
                    {source.sourceCheckedAt ? ` (kontrolleret ${source.sourceCheckedAt})` : ""}
                  </li>
                ))}
              </ul>
            </div>

            {rulePack.disclaimers.length > 0 && (
              <ul className="space-y-1 rounded-md bg-muted p-3 text-muted-foreground">
                {rulePack.disclaimers.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
