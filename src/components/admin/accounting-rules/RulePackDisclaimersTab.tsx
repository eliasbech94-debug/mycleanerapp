import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RulePackLabels } from "@/lib/accounting";
import type { TabProps } from "./RulePackGeneralTab";

const LABEL_FIELDS: [keyof RulePackLabels, string][] = [
  ["businessRegistrationLabel", "rules.disclaimers.labels.businessRegistrationLabel"],
  ["indirectTaxLabel", "rules.disclaimers.labels.indirectTaxLabel"],
  ["indirectTaxNumberLabel", "rules.disclaimers.labels.indirectTaxNumberLabel"],
  ["taxIdentificationLabel", "rules.disclaimers.labels.taxIdentificationLabel"],
  ["filingPeriodLabel", "rules.disclaimers.labels.filingPeriodLabel"],
  ["preliminaryAmountLabel", "rules.disclaimers.labels.preliminaryAmountLabel"],
];

export default function RulePackDisclaimersTab({ pack, readOnly, onChange }: TabProps) {
  const { t } = useTranslation("admin");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.disclaimers.labelsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {LABEL_FIELDS.map(([field, labelKey]) => (
            <div key={field} className="space-y-1">
              <label htmlFor={`label-${field}`} className="text-xs text-muted-foreground">{t(labelKey)}</label>
              <Input
                id={`label-${field}`}
                value={(pack.labels[field] as string) ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange({ labels: { ...pack.labels, [field]: e.target.value } })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.disclaimers.disclaimersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label htmlFor="disclaimers" className="text-xs text-muted-foreground">
            {t("rules.disclaimers.disclaimersHint")}
          </label>
          <Textarea
            id="disclaimers"
            rows={6}
            value={pack.disclaimers.join("\n")}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ disclaimers: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.disclaimers.guidanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label htmlFor="guidance-links" className="text-xs text-muted-foreground">
            {t("rules.disclaimers.guidanceHint")}
          </label>
          <Textarea
            id="guidance-links"
            rows={4}
            value={pack.officialGuidanceLinks.map((l) => `${l.title} | ${l.url}`).join("\n")}
            disabled={readOnly}
            onChange={(e) =>
              onChange({
                officialGuidanceLinks: e.target.value
                  .split("\n")
                  .map((line) => line.split("|").map((part) => part.trim()))
                  .filter((parts) => parts[0])
                  .map((parts) => ({ title: parts[0], url: parts[1] ?? "" })),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
