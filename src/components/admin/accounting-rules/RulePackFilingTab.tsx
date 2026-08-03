import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import type { FilingPeriodKind } from "@/lib/accounting";
import type { TabProps } from "./RulePackGeneralTab";

const PERIODS: FilingPeriodKind[] = ["monthly", "quarterly", "half_yearly", "yearly", "other_local"];

const DOC_FIELDS = [
  ["receiptRequirements", "rules.filing.docFields.receiptRequirements"],
  ["invoiceRequirements", "rules.filing.docFields.invoiceRequirements"],
  ["recordRetentionRules", "rules.filing.docFields.recordRetentionRules"],
] as const;

export default function RulePackFilingTab({ pack, readOnly, onChange }: TabProps) {
  const { t } = useTranslation("admin");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.filing.periodsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {PERIODS.map((period) => (
            <label key={period} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={pack.filingPeriodOptions.includes(period)}
                disabled={readOnly}
                onCheckedChange={() =>
                  onChange({
                    filingPeriodOptions: pack.filingPeriodOptions.includes(period)
                      ? pack.filingPeriodOptions.filter((p) => p !== period)
                      : [...pack.filingPeriodOptions, period],
                  })
                }
              />
              {period}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("rules.filing.deadlinesTitle")}</CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  filingDeadlines: [
                    ...pack.filingDeadlines,
                    { periodKind: pack.filingPeriodOptions[0] ?? "yearly", description: "" },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t("rules.filing.addDeadline")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {pack.filingDeadlines.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("rules.filing.noDeadlines")}</p>
          )}
          {pack.filingDeadlines.map((deadline, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor={`deadline-kind-${index}`} className="text-xs text-muted-foreground">{t("rules.filing.periodLabel")}</label>
                <select
                  id={`deadline-kind-${index}`}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={deadline.periodKind}
                  disabled={readOnly}
                  onChange={(e) =>
                    onChange({
                      filingDeadlines: pack.filingDeadlines.map((d, i) =>
                        i === index ? { ...d, periodKind: e.target.value as FilingPeriodKind } : d,
                      ),
                    })
                  }
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label htmlFor={`deadline-desc-${index}`} className="text-xs text-muted-foreground">{t("rules.filing.descriptionLabel")}</label>
                <Input
                  id={`deadline-desc-${index}`}
                  value={deadline.description}
                  disabled={readOnly}
                  onChange={(e) =>
                    onChange({
                      filingDeadlines: pack.filingDeadlines.map((d, i) =>
                        i === index ? { ...d, description: e.target.value } : d,
                      ),
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("rules.filing.deleteDeadlineAria", { index: index + 1 })}
                    onClick={() =>
                      onChange({ filingDeadlines: pack.filingDeadlines.filter((_, i) => i !== index) })
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.filing.docsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {DOC_FIELDS.map(([field, labelKey]) => (
            <div key={field} className="space-y-1">
              <label htmlFor={`doc-${field}`} className="text-xs text-muted-foreground">
                {t("rules.filing.perLine", { label: t(labelKey) })}
              </label>
              <Textarea
                id={`doc-${field}`}
                value={pack[field].join("\n")}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    [field]: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
