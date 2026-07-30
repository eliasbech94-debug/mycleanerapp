// Admin: manage Legal Center documents (draft → publish, versioning, preview).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";
import { LegalSectionManager } from "@/components/admin/legal/LegalSectionManager";
import { sha256Hex } from "@/lib/legal/hash";

type Row = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  description: string | null;
  icon: string | null;
  country_code: string;
  language: string;
  version: string;
  body_md: string;
  status: string;
  required: boolean;
  effective_at: string | null;
  published_at: string | null;
  body_hash?: string | null;
  doc_uid?: string | null;
};

const EMPTY: Partial<Row> = {
  slug: "",
  kind: "policy",
  title: "",
  description: "",
  icon: "FileText",
  country_code: "DK",
  language: "da",
  version: "1.0",
  body_md: "## Overskrift\n\nSkriv indholdet her.",
  status: "draft",
  required: false,
};

export default function AdminLegal() {
  const { t } = useTranslation("legal");
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>(EMPTY);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-legal-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_documents")
        .select("id,slug,kind,title,description,icon,country_code,language,version,body_md,body_hash,doc_uid,status,required,effective_at,published_at")
        .order("slug")
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.slug) ?? [];
      list.push(r);
      map.set(r.slug, list);
    }
    return [...map.entries()];
  }, [rows]);

  const save = useMutation({
    mutationFn: async (payload: Partial<Row> & { publish?: boolean }) => {
      const { publish, id, ...rest } = payload;
      const body = {
        ...rest,
        // The hash identifies the exact accepted text; recompute on every save.
        body_hash: await sha256Hex(rest.body_md ?? ""),
        status: publish ? "published" : rest.status ?? "draft",
        published_at: publish ? new Date().toISOString() : rest.published_at ?? null,
        effective_at: publish ? rest.effective_at ?? new Date().toISOString() : rest.effective_at ?? null,
      };
      if (id) {
        const { error } = await supabase.from("legal_documents").update(body).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("legal_documents").insert(body as never);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-legal-documents"] });
      qc.invalidateQueries({ queryKey: ["legal-index"] });
      toast({ title: vars.publish ? t("admin.published", "Dokument offentliggjort") : t("admin.saved", "Dokument gemt") });
    },
    onError: (e: Error) => toast({ title: t("admin.error", "Handlingen kunne ikke gennemføres"), description: e.message, variant: "destructive" }),
  });

  function select(row: Row) {
    setSelectedId(row.id);
    setDraft(row);
  }

  return (
    <main className="container-wide mx-auto max-w-7xl px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.title", "Juridiske dokumenter")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.subtitle", "Opret, rediger, versionér og offentliggør dokumenter i Legal Center.")}
          </p>
        </div>
        <Button onClick={() => { setSelectedId(null); setDraft(EMPTY); }}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("admin.new", "Nyt dokument")}
        </Button>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside>
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {!isLoading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("admin.empty", "Ingen dokumenter endnu.")}</p>
          )}
          <ul className="space-y-4">
            {grouped.map(([slug, versions]) => (
              <li key={slug} className="rounded-xl border border-border bg-card p-3">
                <p className="flex items-center gap-2 px-1 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {slug}
                </p>
                <ul className="mt-2 space-y-1">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => select(v)}
                        aria-current={selectedId === v.id}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === v.id ? "bg-muted" : ""}`}
                      >
                        <span className="truncate">
                          {v.country_code}/{v.language} · v{v.version}
                        </span>
                        <Badge variant={v.status === "published" ? "default" : "secondary"}>{v.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-2xl border border-border bg-card p-6">
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">{t("admin.edit", "Redigér")}</TabsTrigger>
              <TabsTrigger value="sections">{t("admin.sections", "Kapitler")}</TabsTrigger>
              <TabsTrigger value="preview">{t("admin.preview", "Preview")}</TabsTrigger>
            </TabsList>

            <TabsContent value="sections" className="mt-6">
              {selectedId && draft.slug ? (
                <LegalSectionManager
                  key={selectedId}
                  document={{
                    id: selectedId,
                    slug: draft.slug ?? "",
                    kind: draft.kind ?? "policy",
                    title: draft.title ?? "",
                    description: draft.description ?? null,
                    icon: draft.icon ?? null,
                    country_code: draft.country_code ?? "DK",
                    language: draft.language ?? "da",
                    version: draft.version ?? "1.0",
                    body_md: draft.body_md ?? "",
                    body_hash: draft.body_hash ?? "",
                    status: draft.status ?? "draft",
                    required: Boolean(draft.required),
                    doc_uid: draft.doc_uid ?? null,
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("admin.selectDocument", "Vælg et dokument i listen for at arbejde med kapitler.")}
                </p>
              )}
            </TabsContent>

            <TabsContent value="edit" className="mt-6 space-y-5">

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="slug" label={t("admin.slug", "Slug")} value={draft.slug ?? ""} onChange={(v) => setDraft({ ...draft, slug: v })} />
                <Field id="kind" label={t("admin.kind", "Type")} value={draft.kind ?? ""} onChange={(v) => setDraft({ ...draft, kind: v })} />
                <Field id="title" label={t("admin.docTitle", "Titel")} value={draft.title ?? ""} onChange={(v) => setDraft({ ...draft, title: v })} />
                <Field id="icon" label={t("admin.icon", "Ikon")} value={draft.icon ?? ""} onChange={(v) => setDraft({ ...draft, icon: v })} />
                <Field id="country" label={t("admin.country", "Land")} value={draft.country_code ?? ""} onChange={(v) => setDraft({ ...draft, country_code: v.toUpperCase() })} />
                <Field id="language" label={t("admin.language", "Sprog")} value={draft.language ?? ""} onChange={(v) => setDraft({ ...draft, language: v.toLowerCase() })} />
                <Field id="version" label={t("admin.version", "Version")} value={draft.version ?? ""} onChange={(v) => setDraft({ ...draft, version: v })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("admin.description", "Beskrivelse")}</Label>
                <Textarea id="description" rows={2} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>

              <div className="flex items-center gap-3">
                <Switch id="required" checked={Boolean(draft.required)} onCheckedChange={(v) => setDraft({ ...draft, required: v })} />
                <Label htmlFor="required">{t("admin.required", "Kræver accept")}</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">{t("admin.content", "Indhold (Markdown)")}</Label>
                <Textarea id="body" rows={18} className="font-mono text-[13px]" value={draft.body_md ?? ""} onChange={(e) => setDraft({ ...draft, body_md: e.target.value })} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ ...draft, id: selectedId ?? undefined })}>
                  {t("admin.save", "Gem kladde")}
                </Button>
                <Button disabled={save.isPending} onClick={() => save.mutate({ ...draft, id: selectedId ?? undefined, publish: true })}>
                  {t("admin.publish", "Publicér")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-6">
              <h2 className="font-heading text-2xl font-semibold tracking-tight">{draft.title}</h2>
              <LegalMarkdown content={draft.body_md ?? ""} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
