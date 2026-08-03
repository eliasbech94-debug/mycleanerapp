import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import type {
  ExpenseCategoryRule,
  ExpenseTreatment,
  IndirectTaxTreatment,
  ProviderRegistrationType,
} from "@/lib/accounting";
import type { TabProps } from "./RulePackGeneralTab";

const TREATMENTS: ExpenseTreatment[] = [
  "generally_allowed",
  "partially_allowed",
  "capital_asset",
  "special_review",
  "generally_disallowed",
];

const TAX_TREATMENTS: IndirectTaxTreatment[] = [
  "deductible",
  "partially_deductible",
  "non_deductible",
  "not_applicable",
  "review_required",
];

const REGISTRATION_TYPES: ProviderRegistrationType[] = [
  "individual",
  "sole_trader",
  "self_employed",
  "company",
  "partnership",
  "other",
];

function emptyCategory(): ExpenseCategoryRule {
  return {
    categoryCode: "",
    localTitle: "",
    description: "",
    allowedRegistrationTypes: [],
    treatment: "special_review",
    businessUseRequired: false,
    documentationRequired: true,
    indirectTaxTreatment: "review_required",
    maximumDeductiblePercentage: null,
    localConditions: [],
    warningText: null,
    officialGuidanceReference: null,
    icon: null,
    sortOrder: null,
    mixedUseAllowed: false,
    capitalAsset: false,
    requiresManualReview: false,
    aiKeywords: [],
  };
}

export default function RulePackCategoriesTab({ pack, readOnly, onChange }: TabProps) {
  const { t } = useTranslation("admin");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const update = (index: number, patch: Partial<ExpenseCategoryRule>) =>
    onChange({
      expenseCategories: pack.expenseCategories.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("rules.categories.title", { count: pack.expenseCategories.length })}</CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onChange({ expenseCategories: [...pack.expenseCategories, emptyCategory()] });
                setOpenIndex(pack.expenseCategories.length);
              }}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t("rules.categories.newCategory")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {pack.expenseCategories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("rules.categories.noCategories")}
            </p>
          )}
          {pack.expenseCategories.map((category, index) => {
            const expanded = openIndex === index;
            return (
              <div key={`${category.categoryCode}-${index}`} className="rounded-lg border border-border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                  aria-expanded={expanded}
                  onClick={() => setOpenIndex(expanded ? null : index)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {category.localTitle || t("rules.categories.untitled")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {category.categoryCode || t("rules.categories.missingCode")}
                    </span>
                  </span>
                  <Badge variant="outline">{category.treatment}</Badge>
                </button>

                {expanded && (
                  <div className="grid gap-4 border-t border-border p-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor={`cat-code-${index}`} className="text-xs text-muted-foreground">{t("rules.categories.categoryCodeLabel")}</label>
                      <Input
                        id={`cat-code-${index}`}
                        value={category.categoryCode}
                        disabled={readOnly}
                        onChange={(e) => update(index, { categoryCode: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cat-title-${index}`} className="text-xs text-muted-foreground">{t("rules.categories.localTitleLabel")}</label>
                      <Input
                        id={`cat-title-${index}`}
                        value={category.localTitle}
                        disabled={readOnly}
                        onChange={(e) => update(index, { localTitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor={`cat-desc-${index}`} className="text-xs text-muted-foreground">{t("rules.categories.descriptionLabel")}</label>
                      <Textarea
                        id={`cat-desc-${index}`}
                        value={category.description}
                        disabled={readOnly}
                        onChange={(e) => update(index, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cat-treatment-${index}`} className="text-xs text-muted-foreground">{t("rules.categories.treatmentLabel")}</label>
                      <select
                        id={`cat-treatment-${index}`}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={category.treatment}
                        disabled={readOnly}
                        onChange={(e) => update(index, { treatment: e.target.value as ExpenseTreatment })}
                      >
                        {TREATMENTS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cat-tax-${index}`} className="text-xs text-muted-foreground">
                        {t("rules.categories.taxTreatmentLabel")}
                      </label>
                      <select
                        id={`cat-tax-${index}`}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={category.indirectTaxTreatment}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(index, { indirectTaxTreatment: e.target.value as IndirectTaxTreatment })
                        }
                      >
                        {TAX_TREATMENTS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cat-max-${index}`} className="text-xs text-muted-foreground">
                        {t("rules.categories.maxDeductibleLabel")}
                      </label>
                      <Input
                        id={`cat-max-${index}`}
                        inputMode="numeric"
                        value={category.maximumDeductiblePercentage ?? ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(index, {
                            maximumDeductiblePercentage:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cat-sort-${index}`} className="text-xs text-muted-foreground">{t("rules.categories.sortLabel")}</label>
                      <Input
                        id={`cat-sort-${index}`}
                        inputMode="numeric"
                        value={category.sortOrder ?? ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(index, { sortOrder: e.target.value === "" ? null : Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor={`cat-keywords-${index}`} className="text-xs text-muted-foreground">
                        {t("rules.categories.keywordsLabel")}
                      </label>
                      <Input
                        id={`cat-keywords-${index}`}
                        value={(category.aiKeywords ?? []).join(", ")}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(index, {
                            aiKeywords: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor={`cat-conditions-${index}`} className="text-xs text-muted-foreground">
                        {t("rules.categories.conditionsLabel")}
                      </label>
                      <Textarea
                        id={`cat-conditions-${index}`}
                        value={category.localConditions.join("\n")}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(index, {
                            localConditions: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor={`cat-warning-${index}`} className="text-xs text-muted-foreground">{t("rules.categories.warningLabel")}</label>
                      <Input
                        id={`cat-warning-${index}`}
                        value={category.warningText ?? ""}
                        disabled={readOnly}
                        onChange={(e) => update(index, { warningText: e.target.value || null })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label htmlFor={`cat-ref-${index}`} className="text-xs text-muted-foreground">
                        {t("rules.categories.referenceLabel")}
                      </label>
                      <Input
                        id={`cat-ref-${index}`}
                        value={category.officialGuidanceReference ?? ""}
                        disabled={readOnly}
                        onChange={(e) => update(index, { officialGuidanceReference: e.target.value || null })}
                      />
                    </div>

                    <fieldset className="md:col-span-2">
                      <legend className="text-xs text-muted-foreground">{t("rules.categories.allowedRegistrationTypes")}</legend>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {REGISTRATION_TYPES.map((type) => (
                          <label key={type} className="flex items-center gap-2 text-sm text-foreground">
                            <Checkbox
                              checked={category.allowedRegistrationTypes.includes(type)}
                              disabled={readOnly}
                              onCheckedChange={() =>
                                update(index, {
                                  allowedRegistrationTypes: category.allowedRegistrationTypes.includes(type)
                                    ? category.allowedRegistrationTypes.filter((t) => t !== type)
                                    : [...category.allowedRegistrationTypes, type],
                                })
                              }
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="flex flex-wrap gap-4 md:col-span-2">
                      {([
                        ["businessUseRequired", t("rules.categories.flags.businessUseRequired")],
                        ["documentationRequired", t("rules.categories.flags.documentationRequired")],
                        ["mixedUseAllowed", t("rules.categories.flags.mixedUseAllowed")],
                        ["capitalAsset", t("rules.categories.flags.capitalAsset")],
                        ["requiresManualReview", t("rules.categories.flags.requiresManualReview")],
                      ] as const).map(([field, label]) => (
                        <label key={field} className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={Boolean(category[field])}
                            disabled={readOnly}
                            onCheckedChange={(v) => update(index, { [field]: v === true } as Partial<ExpenseCategoryRule>)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>

                    {!readOnly && (
                      <div className="md:col-span-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            onChange({
                              expenseCategories: pack.expenseCategories.filter((_, i) => i !== index),
                            })
                          }
                        >
                          <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                          {t("rules.categories.deleteCategory")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.categories.mixedUseTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="mixed-max" className="text-xs text-muted-foreground">{t("rules.categories.mixedMaxLabel")}</label>
            <Input
              id="mixed-max"
              inputMode="numeric"
              value={pack.mixedUseRules.maximumBusinessUsePercentage ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  mixedUseRules: {
                    ...pack.mixedUseRules,
                    maximumBusinessUsePercentage: e.target.value === "" ? null : Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="mixed-doc" className="text-xs text-muted-foreground">
              {t("rules.categories.mixedDocLabel")}
            </label>
            <Input
              id="mixed-doc"
              inputMode="numeric"
              value={pack.mixedUseRules.documentationRequiredAbovePercentage ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  mixedUseRules: {
                    ...pack.mixedUseRules,
                    documentationRequiredAbovePercentage:
                      e.target.value === "" ? null : Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="mixed-review" className="text-xs text-muted-foreground">
              {t("rules.categories.mixedReviewLabel")}
            </label>
            <Input
              id="mixed-review"
              value={pack.mixedUseRules.categoriesRequiringReview.join(", ")}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  mixedUseRules: {
                    ...pack.mixedUseRules,
                    categoriesRequiringReview: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="mixed-disallowed" className="text-xs text-muted-foreground">
              {t("rules.categories.mixedDisallowedLabel")}
            </label>
            <Input
              id="mixed-disallowed"
              value={pack.mixedUseRules.categoriesDisallowed.join(", ")}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  mixedUseRules: {
                    ...pack.mixedUseRules,
                    categoriesDisallowed: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
