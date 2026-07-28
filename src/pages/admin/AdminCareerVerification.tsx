import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Types are minimal — the migration was just applied and generated types
// arrive on the next codegen pass. Untyped access keeps the page shippable.
const db = supabase as any;

type PendingKind = "work_history" | "certification";

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
  evidence_storage_path: string | null;
  evidence_review_note: string | null;
  cleaner_career_profiles?: { mycleaner_id: string; user_id: string } | null;
};

type CertRow = {
  id: string;
  career_profile_id: string;
  certificate_name: string;
  issuer: string | null;
  issued_on: string | null;
  expires_on: string | null;
  verification_status: string;
  evidence_storage_path: string | null;
  cleaner_career_profiles?: { mycleaner_id: string; user_id: string } | null;
};

const PENDING_STATUSES = ["self_reported", "pending"] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    self_reported: { label: "Selv-rapporteret", className: "bg-slate-200 text-slate-900" },
    pending: { label: "Under review", className: "bg-amber-100 text-amber-900" },
    verified: { label: "Verificeret", className: "bg-emerald-100 text-emerald-900" },
    rejected: { label: "Afvist", className: "bg-red-100 text-red-900" },
    expired: { label: "Udløbet", className: "bg-slate-200 text-slate-900" },
  };
  const m = map[status] ?? map.self_reported;
  return <Badge className={m.className}>{m.label}</Badge>;
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
          "id,career_profile_id,company_name,role_title,city,country_code,started_on,ended_on,currently_employed,verification_status,verification_method,evidence_storage_path,evidence_review_note,cleaner_career_profiles(mycleaner_id,user_id)",
        )
        .in("verification_status", PENDING_STATUSES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("cleaner_certifications")
        .select(
          "id,career_profile_id,certificate_name,issuer,issued_on,expires_on,verification_status,evidence_storage_path,cleaner_career_profiles(mycleaner_id,user_id)",
        )
        .in("verification_status", PENDING_STATUSES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setWork((wh as WorkRow[]) ?? []);
    setCerts((c as CertRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(
    kind: PendingKind,
    id: string,
    decision: "verified" | "rejected",
  ) {
    setSavingId(id);
    const table =
      kind === "work_history" ? "cleaner_work_history" : "cleaner_certifications";
    const payload: Record<string, unknown> = {
      verification_status: decision,
      verified_at: decision === "verified" ? new Date().toISOString() : null,
    };
    if (kind === "work_history") {
      payload.evidence_review_note = notes[id] ?? null;
      payload.verification_method = decision === "verified" ? "manual_review" : null;
    }
    const { error } = await db.from(table).update(payload).eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error("Kunne ikke gemme afgørelse", { description: error.message });
      return;
    }
    toast.success(decision === "verified" ? "Verificeret" : "Afvist");
    await load();
  }

  const totalPending = useMemo(() => work.length + certs.length, [work, certs]);

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
          <TabsTrigger value="work_history">
            Arbejdshistorik ({work.length})
          </TabsTrigger>
          <TabsTrigger value="certification">
            Certifikater ({certs.length})
          </TabsTrigger>
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
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          — {row.role_title}
                        </span>
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
                      <div>
                        {row.currently_employed
                          ? "Nuværende"
                          : row.ended_on ?? "—"}
                      </div>
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
                    <div className="text-muted-foreground text-xs mb-1">
                      Beviser
                    </div>
                    {row.evidence_storage_path ? (
                      <code className="text-xs bg-muted p-1 rounded">
                        {row.evidence_storage_path}
                      </code>
                    ) : (
                      <div className="text-xs text-amber-700 flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" /> Ingen dokumenter
                        uploadet
                      </div>
                    )}
                  </div>
                  <Textarea
                    placeholder="Reviewernote (valgfri, gemmes med afgørelsen)"
                    value={notes[row.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [row.id]: e.target.value }))
                    }
                    className="min-h-[70px]"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => decide("work_history", row.id, "rejected")}
                      disabled={savingId === row.id}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Afvis
                    </Button>
                    <Button
                      onClick={() => decide("work_history", row.id, "verified")}
                      disabled={savingId === row.id}
                    >
                      <BadgeCheck className="h-4 w-4 mr-1" /> Verificér
                    </Button>
                  </div>
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
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          — {row.issuer}
                        </span>
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
                    <div className="text-muted-foreground text-xs mb-1">
                      Beviser
                    </div>
                    {row.evidence_storage_path ? (
                      <code className="text-xs bg-muted p-1 rounded">
                        {row.evidence_storage_path}
                      </code>
                    ) : (
                      <div className="text-xs text-amber-700 flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" /> Ingen dokumenter
                        uploadet
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() =>
                        decide("certification", row.id, "rejected")
                      }
                      disabled={savingId === row.id}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Afvis
                    </Button>
                    <Button
                      onClick={() =>
                        decide("certification", row.id, "verified")
                      }
                      disabled={savingId === row.id}
                    >
                      <BadgeCheck className="h-4 w-4 mr-1" /> Verificér
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
