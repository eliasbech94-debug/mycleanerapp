import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";
import type { AccountingRulePack, IndirectTaxRateRule } from "@/lib/accounting";
import type { TabProps } from "./RulePackGeneralTab";

type RateField = keyof Pick<
  AccountingRulePack,
  "defaultIndirectTaxRates" | "reducedIndirectTaxRates" | "zeroRateRules" | "reverseChargeRules"
>;

const GROUPS: { field: RateField; titleKey: string; hintKey: string }[] = [
  { field: "defaultIndirectTaxRates", titleKey: "rules.tax.groups.defaultIndirectTaxRates.title", hintKey: "rules.tax.groups.defaultIndirectTaxRates.hint" },
  { field: "reducedIndirectTaxRates", titleKey: "rules.tax.groups.reducedIndirectTaxRates.title", hintKey: "rules.tax.groups.reducedIndirectTaxRates.hint" },
  { field: "zeroRateRules", titleKey: "rules.tax.groups.zeroRateRules.title", hintKey: "rules.tax.groups.zeroRateRules.hint" },
  { field: "reverseChargeRules", titleKey: "rules.tax.groups.reverseChargeRules.title", hintKey: "rules.tax.groups.reverseChargeRules.hint" },
];

function emptyRate(): IndirectTaxRateRule {
  return {
    taxCode: "",
    rateBasisPoints: 0,
    appliesToCategories: null,
    reverseCharge: false,
    exempt: false,
    description: "",
  };
}

export default function RulePackTaxTab({ pack, readOnly, onChange }: TabProps) {
  const { t } = useTranslation("admin");
  const update = (field: RateField, index: number, patch: Partial<IndirectTaxRateRule>) => {
    const next = pack[field].map((rate, i) => (i === index ? { ...rate, ...patch } : rate));
    onChange({ [field]: next } as Partial<AccountingRulePack>);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.tax.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <Checkbox
              checked={pack.indirectTaxEnabled}
              disabled={readOnly}
              onCheckedChange={(v) => onChange({ indirectTaxEnabled: v === true })}
            />
            {t("rules.tax.hasSystemLabel")}
          </label>
          <div className="space-y-1">
            <label htmlFor="tax-name" className="text-sm font-medium text-foreground">{t("rules.tax.localNameLabel")}</label>
            <Input
              id="tax-name"
              value={pack.indirectTaxName ?? ""}
              disabled={readOnly || !pack.indirectTaxEnabled}
              onChange={(e) => onChange({ indirectTaxName: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tax-system" className="text-sm font-medium text-foreground">{t("rules.tax.systemLabel")}</label>
            <select
              id="tax-system"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pack.indirectTaxSystem ?? ""}
              disabled={readOnly || !pack.indirectTaxEnabled}
              onChange={(e) =>
                onChange({
                  indirectTaxSystem: (e.target.value || null) as AccountingRulePack["indirectTaxSystem"],
                })
              }
            >
              <option value="">{t("rules.tax.notSelected")}</option>
              <option value="vat_like">vat_like</option>
              <option value="sales_tax_like">sales_tax_like</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="tax-threshold" className="text-sm font-medium text-foreground">
              {t("rules.tax.thresholdLabel")}
            </label>
            <Input
              id="tax-threshold"
              inputMode="numeric"
              value={pack.indirectTaxRegistrationThresholdMinor ?? ""}
              disabled={readOnly || !pack.indirectTaxEnabled}
              onChange={(e) =>
                onChange({
                  indirectTaxRegistrationThresholdMinor:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tax-threshold-currency" className="text-sm font-medium text-foreground">
              {t("rules.tax.thresholdCurrencyLabel")}
            </label>
            <Input
              id="tax-threshold-currency"
              value={pack.indirectTaxThresholdCurrency ?? ""}
              disabled={readOnly || !pack.indirectTaxEnabled}
              onChange={(e) =>
                onChange({ indirectTaxThresholdCurrency: e.target.value.toUpperCase() || null })
              }
            />
          </div>
        </CardContent>
      </Card>

      {GROUPS.map(({ field, titleKey, hintKey }) => (
        <Card key={field}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{t(titleKey)}</CardTitle>
              <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
            </div>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onChange({ [field]: [...pack[field], emptyRate()] } as Partial<AccountingRulePack>)
                }
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                {t("rules.tax.addRate")}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {pack[field].length === 0 && (
              <p className="text-sm text-muted-foreground">{t("rules.tax.noRates")}</p>
            )}
            {pack[field].map((rate, index) => (
              <div key={`${field}-${index}`} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-5">
                <div className="space-y-1">
                  <label htmlFor={`${field}-code-${index}`} className="text-xs text-muted-foreground">{t("rules.tax.taxCodeLabel")}</label>
                  <Input
                    id={`${field}-code-${index}`}
                    value={rate.taxCode}
                    disabled={readOnly}
                    onChange={(e) => update(field, index, { taxCode: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${field}-bp-${index}`} className="text-xs text-muted-foreground">{t("rules.tax.basisPointsLabel")}</label>
                  <Input
                    id={`${field}-bp-${index}`}
                    inputMode="numeric"
                    value={rate.rateBasisPoints}
                    disabled={readOnly}
                    onChange={(e) => update(field, index, { rateBasisPoints: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor={`${field}-desc-${index}`} className="text-xs text-muted-foreground">{t("rules.tax.descriptionLabel")}</label>
                  <Input
                    id={`${field}-desc-${index}`}
                    value={rate.description}
                    disabled={readOnly}
                    onChange={(e) => update(field, index, { description: e.target.value })}
                  />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <Checkbox
                      checked={rate.reverseCharge}
                      disabled={readOnly}
                      onCheckedChange={(v) => update(field, index, { reverseCharge: v === true })}
                    />
                    {t("rules.tax.reverseChargeShort")}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <Checkbox
                      checked={rate.exempt}
                      disabled={readOnly}
                      onCheckedChange={(v) => update(field, index, { exempt: v === true })}
                    />
                    {t("rules.tax.exempt")}
                  </label>
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("rules.tax.deleteRateAria", { index: index + 1, title: t(titleKey) })}
                      onClick={() =>
                        onChange({
                          [field]: pack[field].filter((_, i) => i !== index),
                        } as Partial<AccountingRulePack>)
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
