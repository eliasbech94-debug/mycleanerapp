import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import type { RulePackSource } from "@/lib/accounting";
import { isSourceVerified } from "@/lib/accounting/admin";
import type { TabProps } from "./RulePackGeneralTab";

function emptySource(): RulePackSource {
  return {
    officialSourceName: "",
    officialSourceUrl: "",
    sourceDocumentTitle: null,
    sourcePublishedAt: null,
    sourceCheckedAt: null,
    checkedBy: null,
    verificationNotes: null,
  };
}

export default function RulePackSourcesTab({ pack, readOnly, onChange }: TabProps) {
  const { t } = useTranslation("admin");
  const update = (index: number, patch: Partial<RulePackSource>) =>
    onChange({ sources: pack.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{t("rules.sources.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("rules.sources.hint")}
            </p>
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => onChange({ sources: [...pack.sources, emptySource()] })}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t("rules.sources.addSource")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {pack.sources.length === 0 && <p className="text-sm text-muted-foreground">{t("rules.sources.noSources")}</p>}
          {pack.sources.map((source, index) => (
            <div key={index} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={isSourceVerified(source) ? "default" : "outline"}>
                  {isSourceVerified(source) ? t("rules.sources.verified") : t("rules.sources.notVerified")}
                </Badge>
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("rules.sources.deleteSourceAria", { index: index + 1 })}
                    onClick={() => onChange({ sources: pack.sources.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor={`source-name-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.authorityLabel")}</label>
                  <Input
                    id={`source-name-${index}`}
                    value={source.officialSourceName}
                    disabled={readOnly}
                    onChange={(e) => update(index, { officialSourceName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`source-url-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.urlLabel")}</label>
                  <Input
                    id={`source-url-${index}`}
                    value={source.officialSourceUrl}
                    disabled={readOnly}
                    onChange={(e) => update(index, { officialSourceUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`source-doc-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.docTitleLabel")}</label>
                  <Input
                    id={`source-doc-${index}`}
                    value={source.sourceDocumentTitle ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update(index, { sourceDocumentTitle: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`source-published-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.publishedLabel")}</label>
                  <Input
                    id={`source-published-${index}`}
                    type="date"
                    value={source.sourcePublishedAt ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update(index, { sourcePublishedAt: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`source-checked-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.checkedLabel")}</label>
                  <Input
                    id={`source-checked-${index}`}
                    type="date"
                    value={source.sourceCheckedAt ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update(index, { sourceCheckedAt: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`source-by-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.checkedByLabel")}</label>
                  <Input
                    id={`source-by-${index}`}
                    value={source.checkedBy ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update(index, { checkedBy: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor={`source-notes-${index}`} className="text-xs text-muted-foreground">{t("rules.sources.notesLabel")}</label>
                  <Textarea
                    id={`source-notes-${index}`}
                    value={source.verificationNotes ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update(index, { verificationNotes: e.target.value || null })}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.sources.verificationTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="verified-at" className="text-xs text-muted-foreground">{t("rules.sources.verifiedAtLabel")}</label>
            <Input
              id="verified-at"
              type="date"
              value={pack.verifiedAt ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ verifiedAt: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="verified-by" className="text-xs text-muted-foreground">{t("rules.sources.verifiedByLabel")}</label>
            <Input
              id="verified-by"
              value={pack.verifiedBy ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ verifiedBy: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
