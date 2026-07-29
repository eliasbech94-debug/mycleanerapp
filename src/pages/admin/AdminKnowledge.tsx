// Minimum-safe Admin Knowledge CMS.
// - Article list with status tabs, editor drawer, workflow buttons.
// - Version history read-only.
// - Country emergency editor (verify + publish as separate actions).
// - No client-side status writes: every action calls the SECURITY DEFINER RPC.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, AlertTriangle } from "lucide-react";

type Status = "draft" | "in_review" | "approved" | "published" | "archived";
type Risk = "info" | "caution" | "stop" | "emergency";

interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_md: string;
  risk_level: Risk;
  safety_critical: boolean;
  status: Status;
  verification_required: boolean;
  verified_at: string | null;
  current_version: number;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  published_by: string | null;
  submitted_by: string | null;
  updated_at: string;
  updated_by: string | null;
  category_id: string | null;
  expected_review_date: string | null;
}

interface EmergencyRow {
  country_code: string;
  emergency_number: string | null;
  police_number: string | null;
  fire_number: string | null;
  medical_number: string | null;
  poison_control_number: string | null;
  non_emergency_number: string | null;
  source_url: string | null;
  notes: string | null;
  verified_at: string | null;
  published: boolean;
  published_at: string | null;
  updated_at: string;
}

const STATUSES: Status[] = ["draft", "in_review", "approved", "published", "archived"];

const statusBadge = (s: Status) => {
  const variants: Record<Status, string> = {
    draft: "bg-muted text-foreground",
    in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    approved: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    archived: "bg-zinc-500/15 text-zinc-600",
  };
  return <Badge variant="outline" className={variants[s]}>{s}</Badge>;
};

export default function AdminKnowledge() {
  const { isAdmin, isSuperAdmin, loading: rolesLoading } = useUserRoles();
  const hasEditor = isAdmin; // admin/super_admin here; employee/support handled by RLS
  const hasPublisher = isAdmin;

  const [tab, setTab] = useState<Status>("draft");
  const [rows, setRows] = useState<Article[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Article | null>(null);
  const [needsReverify, setNeedsReverify] = useState<Article[]>([]);

  const [confirm, setConfirm] = useState<
    { action: "publish" | "archive"; article: Article } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("knowledge_articles")
      .select("*")
      .eq("status", tab)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Kunne ikke hente artikler", description: error.message, variant: "destructive" });
    } else {
      setRows((data as Article[]) ?? []);
    }
    // "Needs reverification" = published safety_critical + verification_required + verified_at is null
    const { data: nr } = await supabase
      .from("knowledge_articles")
      .select("*")
      .eq("status", "published")
      .eq("verification_required", true)
      .is("verified_at", null)
      .limit(50);
    setNeedsReverify((nr as Article[]) ?? []);
    setLoading(false);
  }, [tab, q]);

  useEffect(() => {
    if (!rolesLoading && hasEditor) load();
  }, [rolesLoading, hasEditor, load]);

  if (rolesLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Henter roller…
      </div>
    );
  }
  if (!hasEditor) {
    return (
      <div className="p-8 max-w-lg">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Du har ikke adgang til Knowledge CMS. Kontakt en administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge CMS</h1>
          <p className="text-sm text-muted-foreground">
            Approval ≠ publication. Safety-critical redigering nulstiller workflowet automatisk.
          </p>
        </div>
        <Button
          onClick={async () => {
            const slug = `kb-${crypto.randomUUID().slice(0, 8)}`;
            const { data, error } = await supabase
              .from("knowledge_articles")
              .insert({ slug, title: "Ny artikel", body_md: "" })
              .select("*")
              .single();
            if (error) {
              toast({ title: "Kunne ikke oprette artikel", description: error.message, variant: "destructive" });
              return;
            }
            setSelected(data as Article);
            load();
          }}
        >
          Ny artikel
        </Button>
      </header>

      {needsReverify.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {needsReverify.length} publiceret artikel kræver reverifikation.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 items-center">
        <Input
          placeholder="Søg efter titel…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Opdater"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">
              {s.replace("_", " ")}
            </TabsTrigger>
          ))}
        </TabsList>
        {STATUSES.map((s) => (
          <TabsContent key={s} value={s} className="mt-4">
            <div className="rounded-md border divide-y">
              {loading && rows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Henter…</div>
              ) : rows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Intet indhold i {s}. Ingen demoartikler.
                </div>
              ) : rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left p-4 hover:bg-muted/40 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.title}</span>
                      {r.safety_critical && (
                        <Badge variant="destructive" className="text-[10px]">SAFETY</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] capitalize">{r.risk_level}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      v{r.current_version} · opdateret {new Date(r.updated_at).toLocaleString()}
                    </div>
                  </div>
                  {statusBadge(r.status)}
                </button>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <EmergencyPanel canPublish={hasPublisher} />

      {selected && (
        <ArticleEditor
          article={selected}
          onClose={() => setSelected(null)}
          onChanged={() => load()}
          canPublish={hasPublisher}
          canArchive={isSuperAdmin}
          onConfirm={setConfirm}
        />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bekræft {confirm?.action === "publish" ? "publish" : "archive"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "publish"
                ? "Publicering gør artiklen synlig for providers. Approval er ikke det samme som publish."
                : "Arkivering fjerner artiklen fra provider-visning. Handlingen skal godkendes af en super_admin."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirm) return;
                const fn = confirm.action === "publish"
                  ? "knowledge_article_publish"
                  : "knowledge_article_archive";
                const { error } = await (supabase.rpc as any)(fn, {
                  _article_id: confirm.article.id,
                });
                if (error) {
                  toast({ title: `Kunne ikke ${confirm.action}`, description: error.message, variant: "destructive" });
                } else {
                  toast({ title: `${confirm.action} gennemført` });
                  setSelected(null);
                  load();
                }
                setConfirm(null);
              }}
            >
              Bekræft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------- Article editor ---------------------------
interface EditorProps {
  article: Article;
  onClose: () => void;
  onChanged: () => void;
  canPublish: boolean;
  canArchive: boolean;
  onConfirm: (c: { action: "publish" | "archive"; article: Article }) => void;
}

function ArticleEditor({ article, onClose, onChanged, canPublish, canArchive, onConfirm }: EditorProps) {
  const [title, setTitle] = useState(article.title);
  const [summary, setSummary] = useState(article.summary ?? "");
  const [body, setBody] = useState(article.body_md);
  const [risk, setRisk] = useState<Risk>(article.risk_level);
  const [safety, setSafety] = useState(article.safety_critical);
  const [expected, setExpected] = useState(article.expected_review_date ?? "");
  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; version: number; created_at: string; change_summary: string | null }>>([]);

  useEffect(() => {
    supabase.from("knowledge_article_versions")
      .select("id, version, created_at, change_summary")
      .eq("article_id", article.id)
      .order("version", { ascending: false })
      .limit(20)
      .then(({ data }) => setVersions((data as any[]) ?? []));
  }, [article.id]);

  const isPublishedSafety = article.status === "published" && article.safety_critical;

  async function call(fn: string, args: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const { error } = await (supabase.rpc as any)(fn, args);
      if (error) throw error;
      toast({ title: `${label} OK` });
      onChanged();
    } catch (e) {
      toast({ title: `${label} fejlede`, description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const canEdit = article.status !== "archived";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {article.title}
            {statusBadge(article.status)}
            {article.safety_critical && <Badge variant="destructive">SAFETY</Badge>}
          </DialogTitle>
        </DialogHeader>

        {isPublishedSafety && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Ændringer i denne publicerede safety-critical artikel nulstiller
              workflowet automatisk (tilbage til draft). Providers ser først den
              nye version efter reverifikation, approval og publish.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-xs uppercase text-muted-foreground">Titel</label>
            <Input value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <label className="text-xs uppercase text-muted-foreground">Resumé</label>
            <Textarea value={summary} disabled={!canEdit} onChange={(e) => setSummary(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2">
            <label className="text-xs uppercase text-muted-foreground">Indhold (markdown, ingen rå HTML)</label>
            <Textarea value={body} disabled={!canEdit} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Risk</label>
              <select
                value={risk}
                disabled={!canEdit}
                onChange={(e) => setRisk(e.target.value as Risk)}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              >
                {(["info", "caution", "stop", "emergency"] as Risk[]).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <input
                id="sc" type="checkbox" checked={safety} disabled={!canEdit}
                onChange={(e) => setSafety(e.target.checked)}
              />
              <label htmlFor="sc" className="text-sm">Safety-critical</label>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Review-dato</label>
              <Input type="date" value={expected} disabled={!canEdit} onChange={(e) => setExpected(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-xs uppercase text-muted-foreground">Change summary (til versionshistorik)</label>
            <Input value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Versionshistorik (read-only)</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {versions.length === 0 && <div className="text-muted-foreground">Ingen versioner endnu.</div>}
              {versions.map((v) => (
                <div key={v.id} className="flex justify-between gap-2">
                  <span>v{v.version}</span>
                  <span className="text-muted-foreground truncate">
                    {v.change_summary ?? "—"} · {new Date(v.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="flex-wrap gap-2 justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              disabled={busy || !canEdit}
              onClick={() => call(
                "knowledge_article_save_draft",
                {
                  _article_id: article.id,
                  _patch: {
                    title, summary, body_md: body,
                    risk_level: risk, safety_critical: safety,
                    expected_review_date: expected || null,
                  },
                  _change_summary: changeSummary || null,
                },
                "Save draft",
              )}
            >Save draft</Button>
            <Button
              variant="outline"
              disabled={busy || article.status !== "draft"}
              onClick={() => call("knowledge_article_submit_for_review", { _article_id: article.id }, "Submit")}
            >Submit for review</Button>
            {canPublish && (
              <>
                <Button
                  variant="outline"
                  disabled={busy || article.status !== "in_review"}
                  onClick={() => call("knowledge_article_approve", { _article_id: article.id }, "Approve")}
                >Approve</Button>
                <Button
                  variant="outline"
                  disabled={busy || !["in_review", "approved"].includes(article.status)}
                  onClick={() => call("knowledge_article_return_to_draft", { _article_id: article.id, _reason: changeSummary || null }, "Return to draft")}
                >Return to draft</Button>
                <Button
                  disabled={busy || article.status !== "approved"}
                  onClick={() => onConfirm({ action: "publish", article })}
                >Publish</Button>
              </>
            )}
            {canArchive && article.status !== "archived" && (
              <Button variant="destructive" disabled={busy} onClick={() => onConfirm({ action: "archive", article })}>
                Archive
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>Luk</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------- Emergency panel ---------------------------
function EmergencyPanel({ canPublish }: { canPublish: boolean }) {
  const [rows, setRows] = useState<EmergencyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EmergencyRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("country_emergency_info")
      .select("*")
      .order("country_code");
    setRows((data as EmergencyRow[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const state = (r: EmergencyRow) =>
    r.published ? "published" : r.verified_at ? "verified" : "unverified";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Country emergency info</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Verify og Publish er adskilte handlinger. Redigering af telefonnummer
          eller kilde nulstiller verifikationen. Placeholder-numre må aldrig publiceres.
        </p>
        <div className="rounded-md border divide-y">
          {rows.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Ingen nødoplysninger registreret endnu.</div>
          )}
          {rows.map((r) => {
            const s = state(r);
            return (
              <div key={r.country_code} className="p-3 flex items-center gap-3 text-sm">
                <span className="font-mono uppercase w-10">{r.country_code}</span>
                <span className="flex-1">
                  Emergency: <b>{r.emergency_number ?? "—"}</b>{" "}
                  Police: {r.police_number ?? "—"} · Fire: {r.fire_number ?? "—"} · Medical: {r.medical_number ?? "—"}
                </span>
                <Badge
                  variant="outline"
                  className={
                    s === "published"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : s === "verified"
                        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }
                >{s}</Badge>
                <Button size="sm" variant="outline" onClick={() => setEdit(r)}>Rediger</Button>
                <Button
                  size="sm" variant="outline" disabled={busy || !!r.verified_at}
                  onClick={async () => {
                    setBusy(true);
                    const { error } = await (supabase.rpc as any)("country_emergency_info_verify", { _country_code: r.country_code });
                    setBusy(false);
                    if (error) toast({ title: "Verify fejlede", description: error.message, variant: "destructive" });
                    else { toast({ title: "Verified" }); load(); }
                  }}
                >Verify</Button>
                {canPublish && (
                  <Button
                    size="sm" disabled={busy || !r.verified_at || r.published}
                    onClick={async () => {
                      setBusy(true);
                      const { error } = await (supabase.rpc as any)("country_emergency_info_publish", { _country_code: r.country_code });
                      setBusy(false);
                      if (error) toast({ title: "Publish fejlede", description: error.message, variant: "destructive" });
                      else { toast({ title: "Published" }); load(); }
                    }}
                  >Publish</Button>
                )}
              </div>
            );
          })}
        </div>

        {edit && (
          <EmergencyEditor row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
        )}
      </CardContent>
    </Card>
  );
}

function EmergencyEditor({ row, onClose, onSaved }: {
  row: EmergencyRow; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<EmergencyRow>(row);
  const [busy, setBusy] = useState(false);
  const changed =
    f.emergency_number !== row.emergency_number ||
    f.police_number !== row.police_number ||
    f.fire_number !== row.fire_number ||
    f.medical_number !== row.medical_number ||
    f.poison_control_number !== row.poison_control_number ||
    f.non_emergency_number !== row.non_emergency_number ||
    f.source_url !== row.source_url;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emergency info — {row.country_code.toUpperCase()}</DialogTitle>
        </DialogHeader>
        {changed && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Ændringen nulstiller verifikationen. Feltet skal verificeres og publiceres igen.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-3">
          {(["emergency_number","police_number","fire_number","medical_number","poison_control_number","non_emergency_number"] as const).map((k) => (
            <div key={k}>
              <label className="text-xs uppercase text-muted-foreground">{k.replace(/_/g, " ")}</label>
              <Input
                value={(f as any)[k] ?? ""}
                onChange={(e) => setF({ ...f, [k]: e.target.value || null })}
              />
            </div>
          ))}
          <div className="col-span-2">
            <label className="text-xs uppercase text-muted-foreground">Kilde-URL</label>
            <Input value={f.source_url ?? ""} onChange={(e) => setF({ ...f, source_url: e.target.value || null })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { error } = await supabase
                .from("country_emergency_info")
                .update({
                  emergency_number: f.emergency_number,
                  police_number: f.police_number,
                  fire_number: f.fire_number,
                  medical_number: f.medical_number,
                  poison_control_number: f.poison_control_number,
                  non_emergency_number: f.non_emergency_number,
                  source_url: f.source_url,
                })
                .eq("country_code", row.country_code);
              setBusy(false);
              if (error) toast({ title: "Kunne ikke gemme", description: error.message, variant: "destructive" });
              else { toast({ title: "Gemt — husk at verificere og publicere igen" }); onSaved(); }
            }}
          >Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
