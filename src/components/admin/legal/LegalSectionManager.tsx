// Admin chapter manager for a legal document: tree, ordering, editing,
// duplicate / split / merge, diff + publish, changelog, audit trail.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GitMerge,
  History,
  Languages,
  Plus,
  Scissors,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";
import { LegalDiffViewer } from "@/components/legal/LegalDiffViewer";
import {
  buildPublishPreview,
  composeSections,
  createDraftVersion,
  createSection,
  createTranslation,
  deleteSection,
  duplicateSection,
  fetchAuditLog,
  fetchChangelog,
  fetchSections,
  mergeSections,
  publishDocumentVersion,
  reorderSections,
  rollbackToVersion,
  sectionsReadingTime,
  splitSection,
  staleTranslations,
  updateSection,
  type LegalDocumentRef,
  type LegalSection,
} from "@/lib/legal/sections";
import { downloadHtml, printAsPdf } from "@/lib/legal/export";
import { cn } from "@/lib/utils";

const TRANSLATION_LANGUAGES = ["en", "da", "sv", "de", "es"];

export function LegalSectionManager({ document: doc }: { document: LegalDocumentRef }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);

  const sectionsQuery = useQuery({
    queryKey: ["legal-sections", doc.id],
    queryFn: () => fetchSections(doc.id),
  });
  const changelogQuery = useQuery({ queryKey: ["legal-changelog", doc.id], queryFn: () => fetchChangelog(doc.id) });
  const auditQuery = useQuery({ queryKey: ["legal-audit", doc.id], queryFn: () => fetchAuditLog(doc.id) });

  const sections = useMemo(
    () => [...(sectionsQuery.data ?? [])].sort((a, b) => a.section_order - b.section_order),
    [sectionsQuery.data],
  );
  const scoped = sections.filter((s) => s.language === doc.language);
  const translations = sections.filter((s) => s.language !== doc.language);
  const stale = useMemo(() => staleTranslations(sections), [sections]);
  const selected = sections.find((s) => s.id === selectedId) ?? scoped[0] ?? null;

  const preview = useQuery({
    queryKey: ["legal-publish-preview", doc.id, sections.map((s) => s.hash).join(":")],
    queryFn: () => buildPublishPreview(doc),
    enabled: publishOpen,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["legal-sections", doc.id] });
    qc.invalidateQueries({ queryKey: ["legal-changelog", doc.id] });
    qc.invalidateQueries({ queryKey: ["legal-audit", doc.id] });
    qc.invalidateQueries({ queryKey: ["admin-legal-documents"] });
    qc.invalidateQueries({ queryKey: ["legal-index"] });
  }

  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      refresh();
      toast({ title: "Gemt" });
    },
    onError: (e: Error) => toast({ title: "Handlingen fejlede", description: e.message, variant: "destructive" }),
  });

  const publish = useMutation({
    mutationFn: async () => publishDocumentVersion({ document: doc, reason: reason || undefined }),
    onSuccess: (r) => {
      refresh();
      setPublishOpen(false);
      setReason("");
      toast({ title: `Publiceret som version ${r.version}`, description: `Hash: ${r.hash.slice(0, 16)}…` });
    },
    onError: (e: Error) => toast({ title: "Publicering fejlede", description: e.message, variant: "destructive" }),
  });

  function move(section: LegalSection, delta: number) {
    const ids = scoped.map((s) => s.id);
    const from = ids.indexOf(section.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    run.mutate(() => reorderSections(doc.id, ids));
  }

  function dropOn(target: LegalSection) {
    if (!dragId || dragId === target.id) return;
    const ids = scoped.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(target.id);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    run.mutate(() => reorderSections(doc.id, ids));
  }

  const composed = composeSections(scoped);
  const minutes = sectionsReadingTime(scoped);
  const isPublished = doc.status === "published";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="text-sm">
          <p className="font-medium">
            {doc.doc_uid ?? "—"} · v{doc.version}{" "}
            <Badge variant={isPublished ? "default" : "secondary"}>{doc.status}</Badge>
          </p>
          <p className="text-muted-foreground">
            {scoped.length} kapitler · {minutes} min. læsetid · {translations.length} oversættelser
            {stale.length > 0 && <span className="ml-2 text-destructive">{stale.length} forældede oversættelser</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run.mutate(() =>
                createSection({ documentId: doc.id, title: `Kapitel ${scoped.length + 1}`, language: doc.language, sections }),
              )
            }
            disabled={isPublished}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nyt kapitel
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadHtml({ title: doc.title, version: doc.version, docUid: doc.doc_uid, hash: doc.body_hash }, composed, doc.slug)}>
            HTML
          </Button>
          <Button size="sm" variant="outline" onClick={() => printAsPdf({ title: doc.title, version: doc.version, docUid: doc.doc_uid, hash: doc.body_hash }, composed)}>
            PDF / print
          </Button>
          {isPublished ? (
            <>
              <Button size="sm" onClick={() => run.mutate(() => createDraftVersion(doc, "minor"))}>
                Ny kladdeversion
              </Button>
              <Button size="sm" variant="outline" onClick={() => run.mutate(() => rollbackToVersion(doc, "rollback"))}>
                <History className="mr-2 h-4 w-4" aria-hidden="true" />
                Rollback
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              <UploadCloud className="mr-2 h-4 w-4" aria-hidden="true" />
              Gennemgå og publicér
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dokumenttræ</h3>
          {sectionsQuery.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
          <ul className="space-y-1">
            {scoped.map((s, i) => (
              <li
                key={s.id}
                draggable={!isPublished}
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(s)}
                className={cn(
                  "flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5",
                  selected?.id === s.id && "border-border bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="flex-1 truncate text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-current={selected?.id === s.id}
                >
                  {i + 1}. {s.title}
                  <span className="ml-1 text-xs text-muted-foreground">v{s.version}</span>
                </button>
                <Badge variant={s.status === "published" ? "default" : "secondary"} className="text-[10px]">
                  {s.status}
                </Badge>
                <Button size="icon" variant="ghost" aria-label={`Flyt ${s.title} op`} disabled={isPublished || i === 0} onClick={() => move(s, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Flyt ${s.title} ned`}
                  disabled={isPublished || i === scoped.length - 1}
                  onClick={() => move(s, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>

          {translations.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oversættelser</h3>
              <ul className="space-y-1 text-sm">
                {translations.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className="w-full truncate rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      [{s.language}] {s.title}
                      {stale.some((x) => x.id === s.id) && <span className="ml-2 text-xs text-destructive">forældet</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-6">
          {selected ? (
            <SectionEditor
              key={selected.id}
              section={selected}
              disabled={isPublished}
              sections={sections}
              onSave={(patch, why) => run.mutate(() => updateSection(selected, patch, why))}
              onDuplicate={() => run.mutate(() => duplicateSection(selected, sections))}
              onSplit={() => run.mutate(() => splitSection(selected, sections))}
              onDelete={() => run.mutate(() => deleteSection(selected))}
              onTranslate={(lang) => run.mutate(() => createTranslation(selected, lang))}
              mergeSourceId={mergeSourceId}
              setMergeSourceId={setMergeSourceId}
              onMerge={(sourceId) => {
                const source = sections.find((s) => s.id === sourceId);
                if (source) run.mutate(() => mergeSections(selected, source));
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Ingen kapitler endnu — opret det første kapitel.</p>
          )}

          <section className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">Ændringslog</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(changelogQuery.data ?? []).map((c) => (
                <li key={c.id} className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="font-medium">
                    Version {c.version}
                    {c.previous_version && <span className="text-muted-foreground"> (fra {c.previous_version})</span>}
                  </p>
                  <p className="text-muted-foreground">{c.summary}</p>
                </li>
              ))}
              {!changelogQuery.data?.length && <li className="text-muted-foreground">Ingen udgivelser endnu.</li>}
            </ul>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">Revisionsspor</h3>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {(auditQuery.data ?? []).slice(0, 20).map((a) => (
                <li key={a.id}>
                  {new Date(a.created_at).toLocaleString("da-DK")} · {a.action}
                  {a.new_hash ? ` · ${a.new_hash.slice(0, 12)}…` : ""}
                  {a.reason ? ` · ${a.reason}` : ""}
                </li>
              ))}
              {!auditQuery.data?.length && <li>Ingen hændelser endnu.</li>}
            </ul>
          </section>
        </div>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Publicér {doc.title}</DialogTitle>
          </DialogHeader>
          {preview.isLoading && <Skeleton className="h-48 w-full" />}
          {preview.data && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ny version: <span className="font-medium text-foreground">{preview.data.nextVersion}</span> · anbefalet bump:{" "}
                {preview.data.bump} · nyt hash: <code className="text-xs">{preview.data.nextHash.slice(0, 24)}…</code>
              </p>
              <ul className="space-y-1 text-sm">
                {preview.data.changes.map((c, i) => (
                  <li key={i}>
                    <Badge variant="secondary" className="mr-2">{c.kind}</Badge>
                    {c.title}
                  </li>
                ))}
                {!preview.data.changes.length && <li className="text-muted-foreground">Ingen indholdsændringer.</li>}
              </ul>
              <LegalDiffViewer oldText={preview.data.previousBody} newText={preview.data.nextBody} />
              <div className="space-y-2">
                <Label htmlFor="publish-reason">Begrundelse (gemmes i revisionssporet)</Label>
                <Input id="publish-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Annullér
            </Button>
            <Button disabled={publish.isPending} onClick={() => publish.mutate()}>
              Publicér
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionEditor({
  section,
  sections,
  disabled,
  onSave,
  onDuplicate,
  onSplit,
  onDelete,
  onTranslate,
  onMerge,
  mergeSourceId,
  setMergeSourceId,
}: {
  section: LegalSection;
  sections: LegalSection[];
  disabled: boolean;
  onSave: (patch: { title: string; content_md: string }, reason?: string) => void;
  onDuplicate: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onTranslate: (language: string) => void;
  onMerge: (sourceId: string) => void;
  mergeSourceId: string | null;
  setMergeSourceId: (id: string | null) => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content_md);
  const mergeable = sections.filter((s) => s.id !== section.id && s.language === section.language);

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="section-title">Kapiteltitel</Label>
            <Input id="section-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section-content">Indhold (Markdown)</Label>
            <Textarea
              id="section-content"
              rows={16}
              className="font-mono text-[13px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={disabled} onClick={() => onSave({ title, content_md: content })}>
              Gem kapitel
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              Duplikér
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={onSplit}>
              <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
              Opdel
            </Button>
            <Button size="sm" variant="outline" disabled={disabled || !mergeSourceId} onClick={() => mergeSourceId && onMerge(mergeSourceId)}>
              <GitMerge className="mr-2 h-4 w-4" aria-hidden="true" />
              Flet ind
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Slet
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="merge-source" className="text-xs">Flet dette kapitel ind i det valgte</Label>
              <select
                id="merge-source"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={mergeSourceId ?? ""}
                onChange={(e) => setMergeSourceId(e.target.value || null)}
                disabled={disabled}
              >
                <option value="">Vælg kapitel…</option>
                {mergeable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="translate-lang" className="text-xs">
                <Languages className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Opret oversættelse
              </Label>
              <select
                id="translate-lang"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                defaultValue=""
                onChange={(e) => e.target.value && onTranslate(e.target.value)}
                disabled={disabled}
              >
                <option value="">Vælg sprog…</option>
                {TRANSLATION_LANGUAGES.filter((l) => l !== section.language).map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</h3>
          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-border p-4">
            <LegalMarkdown content={content} />
          </div>
        </div>
      </div>
    </section>
  );
}
