import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Eye, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const db = supabase;

type PendingKind = "work_history" | "certification";

type EvidenceDoc = {
  id: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  status: string;
  uploaded_at: string;
};

type WorkRow = {
  id: string;
  career_profile_id: string;
  company_name: string;
  role_title: string | null;
  city: string | null;
  country_code: string | null;
  started_on: string;
  ended_on: string | null;
  currently_employed: boolean;
  verification_status: string;
  verification_method: string | null;
  evidence_review_note: string | null;
  cleaner_career_profiles?: { mycleaner_id: string; user_id: string } | null;
  documents?: EvidenceDoc[];
};

type CertRow = {
  id: string;
  career_profile_id: string;
  certificate_name: string;
  issuer: string | null;
  issued_on: string | null;
  expires_on: string | null;
  verification_status: string;
  cleaner_career_profiles?: { mycleaner_id: string; user_id: string } | null;
  documents?: EvidenceDoc[];
};

const PENDING_STATUSES = [
  "self_reported",
  "pending",
  "under_review",
  "more_information_required",
] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    self_reported: { label: "Selv-rapporteret", className: "bg-slate-200 text-slate-900" },
    pending: { label: "Afventer", className: "bg-amber-100 text-amber-900" },
    under_review: { label: "Under review", className: "bg-blue-100 text-blue-900" },
    more_information_required: { label: "Mere info", className: "bg-orange-100 text-orange-900" },
    verified: { label: "Verificeret", className: "bg-emerald-100 text-emerald-900" },
    rejected: { label: "Afvist", className: "bg-red-100 text-red-900" },
    expired: { label: "Udløbet", className: "bg-slate-200 text-slate-900" },
  };
  const m = map[status] ?? map.self_reported;
  return <Badge className={m.className}>{m.label}</Badge>;
}

async function openDocument(document_id: string) {
  const { data, error } = await db.functions.invoke("career-evidence-url", {
    body: { document_id },
  });
  if (error || !data?.url) {
    toast.error("Kunne ikke åbne dokument", { description: error?.message });
    return;
  }
  window.open(data.url, "_blank", "noopener,noreferrer");
}

export default function AdminCareerVerification() {
  const [tab, setTab] = useState<PendingKind>("work_history");
  const [work, setWork] = useState<WorkRow[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: wh }, { data: c }] = await Promise.all([
      db
        .from("cleaner_work_history")
        .select(
          "id,career_profile_id,company_name,role_title,city,country_code,started_on,ended_on,currently_employed,verification_status,verification_method,evidence_review_note,cleaner_career_profiles(mycleaner_id,user_id)",
        )
        .in("verification_status", PENDING_STATUSES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("cleaner_certifications")
        .select(
          "id,career_profile_id,certificate_name,issuer,issued_on,expires_on,verification_status,cleaner_career_profiles(mycleaner_id,user_id)",
        )
        .in("verification_status", PENDING_STATUSES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const workRows = (wh as WorkRow[]) ?? [];
    const certRows = (c as CertRow[]) ?? [];

    // Fetch document metadata for each set in a single query
    const workIds = workRows.map((r) => r.id);
    const certIds = certRows.map((r) => r.id);
    const [{ data: workDocs }, { data: certDocs }] = await Promise.all([
      workIds.length
        ? db
            .from("career_evidence_documents")
            .select("id,work_history_id,certification_id,original_filename,mime_type,size_bytes,status,uploaded_at")
            .in("work_history_id", workIds)
        : Promise.resolve({ data: [] }),
      certIds.length
        ? db
            .from("career_evidence_documents")
            .select("id,work_history_id,certification_id,original_filename,mime_type,size_bytes,status,uploaded_at")
            .in("certification_id", certIds)
        : Promise.resolve({ data: [] }),
    ]);

    const workDocMap = new Map<string, EvidenceDoc[]>();
    for (const d of (workDocs ?? []) as any[]) {
      const arr = workDocMap.get(d.work_history_id) ?? [];
      arr.push(d as EvidenceDoc);
      workDocMap.set(d.work_history_id, arr);
    }
    const certDocMap = new Map<string, EvidenceDoc[]>();
    for (const d of (certDocs ?? []) as any[]) {
      const arr = certDocMap.get(d.certification_id) ?? [];
      arr.push(d as EvidenceDoc);
      certDocMap.set(d.certification_id, arr);
    }

    setWork(workRows.map((r) => ({ ...r, documents: workDocMap.get(r.id) ?? [] })));
    setCerts(certRows.map((r) => ({ ...r, documents: certDocMap.get(r.id) ?? [] })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(
    kind: PendingKind,
    id: string,
    decision: "verified" | "rejected" | "more_information_required" | "under_review",
    documentIds: string[],
  ) {
    setSavingId(id);
    const { error } = await db.functions.invoke("career-verification-decide", {
      body: {
        kind,
        record_id: id,
        decision,
        note: notes[id] ?? undefined,
        reason: decision === "rejected" ? notes[id] ?? undefined : undefined,
        document_ids: documentIds,
      },
    });
    setSavingId(null);
    if (error) {
      toast.error("Kunne ikke gemme afgørelse", { description: error.message });
      return;
    }
    toast.success("Afgørelse gemt");
    await load();
  }

  const totalPending = useMemo(() => work.length + certs.length, [work, certs]);

  const DocsList = ({ docs }: { docs?: EvidenceDoc[] }) =>
    !docs || docs.length === 0 ? (
      <div className="text-xs text-amber-700 flex items-center gap-1">
        <ShieldAlert className="h-3.5 w-3.5" /> Ingen dokumenter uploadet
      </div>
    ) : (
      <div className="space-y-1.5">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded border bg-muted/40 px-2 py-1.5 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.original_filename ?? "Dokument"}</p>
              <p className="text-muted-foreground">
                {d.mime_type} · {(d.size_bytes / 1024).toFixed(0)} KB · {d.status}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => openDocument(d.id)}>
              <Eye className="mr-1 h-3.5 w-3.5" /> Åbn
            </Button>
          </div>
        ))}
      </div>
    );

  const ActionRow = ({ kind, id, docs }: { kind: PendingKind; id: string; docs?: EvidenceDoc[] }) => {
    const docIds = (docs ?? []).map((d) => d.id);
    return (
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => decide(kind, id, "more_information_required", docIds)}
          disabled={savingId === id}
        >
          Bed om mere info
        </Button>
        <Button
          variant="outline"
          onClick={() => decide(kind, id, "rejected", docIds)}
          disabled={savingId === id}
        >
          <XCircle className="h-4 w-4 mr-1" /> Afvis
        </Button>
        <Button
          onClick={() => decide(kind, id, "verified", docIds)}
          disabled={savingId === id}
        >
          <BadgeCheck className="h-4 w-4 mr-1" /> Verificér
        </Button>
      </div>
    );
  };

  return (
    <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-6">
      <BackButton />
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Career Verification Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Manuel verifikation af cleaners' arbejdshistorik og certifikater.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {totalPending} afventer
        </Badge>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PendingKind)}>
        <TabsList>
          <TabsTrigger value="work_history">Arbejdshistorik ({work.length})</TabsTrigger>
          <TabsTrigger value="certification">Certifikater ({certs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="work_history" className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
            </div>
          ) : work.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Ingen arbejdshistorik afventer verifikation.
              </CardContent>
            </Card>
          ) : (
            work.map((row) => (
              <Card key={row.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {row.company_name}
                      {row.role_title ? (
                        <span className="text-muted-foreground font-normal"> — {row.role_title}</span>
                      ) : null}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {row.cleaner_career_profiles?.mycleaner_id}
                      </span>
                      <StatusBadge status={row.verification_status} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-muted-foreground">Fra</div>
                      <div>{row.started_on}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Til</div>
                      <div>{row.currently_employed ? "Nuværende" : row.ended_on ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">By</div>
                      <div>{row.city ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Land</div>
                      <div>{row.country_code ?? "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Dokumenter</div>
                    <DocsList docs={row.documents} />
                  </div>
                  <Textarea
                    placeholder="Intern note (gemmes med afgørelsen)"
                    value={notes[row.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                    className="min-h-[70px]"
                  />
                  <ActionRow kind="work_history" id={row.id} docs={row.documents} />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="certification" className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
            </div>
          ) : certs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Ingen certifikater afventer verifikation.
              </CardContent>
            </Card>
          ) : (
            certs.map((row) => (
              <Card key={row.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {row.certificate_name}
                      {row.issuer ? (
                        <span className="text-muted-foreground font-normal"> — {row.issuer}</span>
                      ) : null}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {row.cleaner_career_profiles?.mycleaner_id}
                      </span>
                      <StatusBadge status={row.verification_status} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground">Udstedt</div>
                      <div>{row.issued_on ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Udløber</div>
                      <div>{row.expires_on ?? "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Dokumenter</div>
                    <DocsList docs={row.documents} />
                  </div>
                  <ActionRow kind="certification" id={row.id} docs={row.documents} />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
