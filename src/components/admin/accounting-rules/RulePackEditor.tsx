import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { AccountingRulePack } from "@/lib/accounting";
import {
  compareRulePacks,
  evaluatePublishReadiness,
  exportRulePack,
  importRulePack,
  publishRulePack,
  retireRulePack,
  submitForReview,
  approveRulePack,
  validateRulePack,
  AUDIT_ACTION_LABELS,
  type RulePackAuditEntry,
} from "@/lib/accounting/admin";
import type { RulePackManager } from "@/hooks/useRulePackManager";
import RulePackGeneralTab from "./RulePackGeneralTab";
import RulePackTaxTab from "./RulePackTaxTab";
import RulePackCategoriesTab from "./RulePackCategoriesTab";
import RulePackMileageTab from "./RulePackMileageTab";
import RulePackFilingTab from "./RulePackFilingTab";
import RulePackDisclaimersTab from "./RulePackDisclaimersTab";
import RulePackSourcesTab from "./RulePackSourcesTab";
import { RulePackStatusBadge } from "./RulePackStatusBadge";

export interface RulePackEditorProps {
  pack: AccountingRulePack;
  manager: RulePackManager;
  onClose: () => void;
}

export default function RulePackEditor({ pack, manager, onClose }: RulePackEditorProps) {
  const [draft, setDraft] = useState<AccountingRulePack>(pack);
  const [json, setJson] = useState(() => JSON.stringify(exportRulePack(draft), null, 2));
  const [compareId, setCompareId] = useState("");

  const readOnly = draft.status === "published" || draft.status === "retired" || !manager.can("edit");
  const report = useMemo(
    () => validateRulePack(draft, { otherPacks: manager.packs }),
    [draft, manager.packs],
  );
  const readiness = useMemo(
    () => evaluatePublishReadiness(draft, { otherPacks: manager.packs }),
    [draft, manager.packs],
  );
  const diff = useMemo(() => {
    const other = manager.packs.find((p) => p.id === compareId);
    return other ? compareRulePacks(other, draft) : null;
  }, [compareId, draft, manager.packs]);

  const auditForPack: RulePackAuditEntry[] = manager.auditLog.filter((e) => e.rulePackId === draft.id);

  const change = (patch: Partial<AccountingRulePack>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    manager.upsertPack(draft);
    manager.record("rule_pack_edited", draft, "Rule pack gemt som lokal arbejdskopi.");
    toast.success("Ændringer gemt i arbejdskopien.");
  };

  const runLifecycle = (
    fn: typeof submitForReview,
    action: Parameters<RulePackManager["record"]>[0],
  ) => {
    manager.upsertPack(draft);
    const outcome = fn([...manager.packs.filter((p) => p.id !== draft.id), draft], draft.id, manager.actor);
    if (outcome.ok !== true) {
      toast.error(outcome.reason);
      return;
    }
    manager.setPacks(outcome.packs);
    const updated = outcome.packs.find((p) => p.id === draft.id);
    if (updated) setDraft(updated);
    manager.record(action, updated ?? draft, outcome.message);
    toast.success(outcome.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {draft.countryCode} · {draft.rulePackVersion}
          </h2>
          <RulePackStatusBadge status={draft.status} />
          {draft.sampleOnly && <Badge variant="destructive">Testdata — kan ikke publiceres</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose}>Luk</Button>
          <Button variant="outline" disabled={readOnly} onClick={save}>Gem</Button>
          <Button
            variant="outline"
            disabled={!manager.can("submit_for_review") || draft.status !== "draft"}
            onClick={() => runLifecycle(submitForReview, "submitted_for_review")}
          >
            Send til review
          </Button>
          <Button
            variant="outline"
            disabled={!manager.can("approve") || draft.status !== "in_review"}
            onClick={() => runLifecycle(approveRulePack, "approved")}
          >
            Godkend
          </Button>
          <Button
            disabled={!manager.can("publish") || !readiness.ready || draft.status !== "approved"}
            onClick={() => runLifecycle(publishRulePack, "published")}
          >
            Publicér
          </Button>
          <Button
            variant="destructive"
            disabled={!manager.can("retire") || draft.status !== "published"}
            onClick={() => runLifecycle(retireRulePack, "retired")}
          >
            Retire
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Publish readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {readiness.checks.map((check) => (
            <div key={check.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-foreground">{check.label}</span>
              <span className={check.passed ? "text-muted-foreground" : "text-destructive"}>
                {check.passed ? "OK" : check.detail}
              </span>
            </div>
          ))}
          {report.blockingErrors.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {report.blockingErrors.map((issue) => (
                <li key={issue.code + issue.field}>{issue.message}</li>
              ))}
            </ul>
          )}
          {report.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {report.warnings.map((issue) => (
                <li key={issue.code + issue.field}>{issue.message}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="general">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="general">Generelt</TabsTrigger>
          <TabsTrigger value="tax">Skat</TabsTrigger>
          <TabsTrigger value="categories">Kategorier</TabsTrigger>
          <TabsTrigger value="mileage">Kørsel</TabsTrigger>
          <TabsTrigger value="filing">Indberetning</TabsTrigger>
          <TabsTrigger value="labels">Tekster</TabsTrigger>
          <TabsTrigger value="sources">Kilder</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
          <TabsTrigger value="compare">Sammenlign</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="general"><RulePackGeneralTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>
        <TabsContent value="tax"><RulePackTaxTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>
        <TabsContent value="categories"><RulePackCategoriesTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>
        <TabsContent value="mileage"><RulePackMileageTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>
        <TabsContent value="filing"><RulePackFilingTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>
        <TabsContent value="labels"><RulePackDisclaimersTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>
        <TabsContent value="sources"><RulePackSourcesTab pack={draft} readOnly={readOnly} onChange={change} /></TabsContent>

        <TabsContent value="json">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">JSON import / eksport</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setJson(JSON.stringify(exportRulePack(draft), null, 2))}>
                  Eksportér nuværende
                </Button>
                <Button
                  size="sm"
                  disabled={readOnly}
                  onClick={() => {
                    const result = importRulePack(json, draft.id);
                    if (result.ok === false) {
                      toast.error(result.errors.join(" "));
                      return;
                    }
                    setDraft({ ...result.rulePack, id: draft.id });
                    manager.record("imported_json", draft, "Rule pack importeret fra JSON.");
                    toast.success("JSON importeret til arbejdskopien.");
                  }}
                >
                  Importér
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <label htmlFor="rule-pack-json" className="text-xs text-muted-foreground">
                Rule pack JSON (import validerer skema før den erstatter arbejdskopien)
              </label>
              <Textarea
                id="rule-pack-json"
                className="mt-1 font-mono text-xs"
                rows={18}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sammenlign med anden version</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label htmlFor="compare-select" className="text-xs text-muted-foreground">Vælg rule pack</label>
              <select
                id="compare-select"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={compareId}
                onChange={(e) => setCompareId(e.target.value)}
              >
                <option value="">Ingen</option>
                {manager.packs
                  .filter((p) => p.id !== draft.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.countryCode} {p.rulePackVersion}
                    </option>
                  ))}
              </select>
              {diff?.crossCountry && (
                <p className="rounded-md border border-border bg-muted/30 p-2 text-sm text-muted-foreground">
                  Sammenligning på tværs af lande er kun til inspiration — regler kan ikke kopieres direkte.
                </p>
              )}
              {diff && diff.identical && <p className="text-sm text-muted-foreground">Ingen forskelle.</p>}
              {diff && !diff.identical && (
                <ul className="space-y-2">
                  {diff.entries.map((entry, index) => (
                    <li key={index} className="rounded-md border border-border p-2 text-sm">
                      <span className="block font-medium text-foreground">{entry.label}</span>
                      <span className="block text-muted-foreground">
                        {entry.before ?? "—"} → {entry.after ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit log (append-only)</CardTitle>
            </CardHeader>
            <CardContent>
              {auditForPack.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen hændelser registreret i denne session.</p>
              ) : (
                <ul className="space-y-2">
                  {auditForPack.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border p-2 text-sm">
                      <span className="font-medium text-foreground">{AUDIT_ACTION_LABELS[entry.action]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.createdAt} · {entry.actorRoles.join(", ") || "ukendt rolle"}
                      </span>
                      {entry.summary && <span className="block text-muted-foreground">{entry.summary}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
