import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Download, FileArchive, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import BackButton from "@/components/BackButton";

type ExportJob = {
  id: string; status: string; created_at: string;
  ready_at: string | null; expires_at: string | null;
  file_bytes: number | null;
};
type DeletionReq = {
  id: string; status: string; scheduled_delete_at: string | null;
  rejection_legal_reason: string | null; created_at: string;
  reviewer_notes: string | null;
};
type ConsentMap = Record<string, { granted: boolean; policy_version: string; created_at: string }>;

const CONSENTS: { key: string; label: string; help: string }[] = [
  { key: "terms", label: "Vilkår & betingelser", help: "Kræves for at bruge platformen." },
  { key: "privacy", label: "Persondatapolitik", help: "Kræves for at bruge platformen." },
  { key: "marketing_email", label: "Marketing e-mails", help: "Tilbud, nyheder og kampagner." },
  { key: "marketing_sms", label: "Marketing SMS", help: "SMS-kampagner og tilbud." },
  { key: "push", label: "Push-notifikationer", help: "Beskeder på enheden." },
  { key: "analytics_cookies", label: "Analyse-cookies", help: "Hjælper os med at forbedre appen." },
];

export default function PrivacyCenter() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [deletion, setDeletion] = useState<DeletionReq | null>(null);
  const [consents, setConsents] = useState<ConsentMap>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    const [{ data: jobsRows }, { data: delRows }, { data: cs }] = await Promise.all([
      supabase.from("gdpr_export_jobs").select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(10),
      supabase.from("account_deletion_requests").select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1),
      supabase.functions.invoke("gdpr-consent", { method: "GET" }),
    ]);
    setJobs(jobsRows ?? []);
    setDeletion(delRows?.[0] ?? null);
    setConsents(((cs as any)?.latest ?? {}) as ConsentMap);
  }

  useEffect(() => { load(); }, [user]);

  async function requestExport() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("gdpr-export-request");
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success((data as any)?.message ?? "Eksport er sat i kø. Du får besked når den er klar.");
    load();
  }

  async function download(jobId: string) {
    const { data, error } = await supabase.functions.invoke("gdpr-export-download", { body: { job_id: jobId } });
    if (error || !(data as any)?.url) return toast.error("Kunne ikke hente download-link.");
    window.open((data as any).url, "_blank", "noopener,noreferrer");
  }

  async function requestDeletion(reason: string) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("gdpr-delete-request", { body: { reason } });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Din sletningsforespørgsel er registreret.");
    setDeletion((data as any)?.request ?? null);
    load();
  }

  async function toggleConsent(type: string, granted: boolean) {
    const { error } = await supabase.functions.invoke("gdpr-consent", {
      body: { consent_type: type, granted, policy_version: "2025-01", source: "privacy_center" },
    });
    if (error) return toast.error(error.message);
    toast.success(granted ? "Samtykke givet" : "Samtykke trukket tilbage");
    load();
  }

  if (!user) return (
    <div className="max-w-3xl mx-auto p-6">
      <p>Log ind for at åbne dit privatlivscenter.</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <BackButton />
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-serif">Privatlivscenter</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Her kan du hente en kopi af dine data, styre dine samtykker og anmode om sletning af din konto.
      </p>

      {/* Export */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2">
          <FileArchive className="h-5 w-5" /> Download mine data
        </CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Vi samler alle dine oplysninger som en JSON-fil. Følsomme identifikatorer (CPR/CVR, kort- og bankoplysninger) maskeres.
            Filen slettes automatisk efter 7 dage.
          </p>
          <Button onClick={requestExport} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Anmod om ny eksport
          </Button>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between border rounded p-3 text-sm">
                <div>
                  <div className="font-medium">Status: {j.status}</div>
                  <div className="text-muted-foreground">
                    Oprettet {new Date(j.created_at).toLocaleString("da-DK")}
                    {j.expires_at ? ` · udløber ${new Date(j.expires_at).toLocaleDateString("da-DK")}` : ""}
                  </div>
                </div>
                {j.status === "ready" && (
                  <Button size="sm" onClick={() => download(j.id)}>
                    <Download className="h-4 w-4 mr-1" /> Hent
                  </Button>
                )}
              </div>
            ))}
            {jobs.length === 0 && <p className="text-sm text-muted-foreground">Ingen tidligere eksporter.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Consents */}
      <Card>
        <CardHeader><CardTitle>Samtykker</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {CONSENTS.map((c) => {
            const cur = consents[c.key];
            const granted = cur?.granted ?? false;
            return (
              <div key={c.key} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.help}</div>
                  {cur && <div className="text-xs text-muted-foreground">Version {cur.policy_version} · {new Date(cur.created_at).toLocaleDateString("da-DK")}</div>}
                </div>
                <Switch checked={granted} onCheckedChange={(v) => toggleConsent(c.key, v)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Deletion */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" /> Slet min konto
        </CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {deletion ? (
            <div className="text-sm space-y-1">
              <div>Status: <strong>{deletion.status}</strong></div>
              {deletion.scheduled_delete_at && (
                <div>Planlagt endelig sletning: {new Date(deletion.scheduled_delete_at).toLocaleString("da-DK")}</div>
              )}
              {deletion.reviewer_notes && <div className="text-muted-foreground">Note: {deletion.reviewer_notes}</div>}
              {deletion.rejection_legal_reason && (
                <div className="text-destructive">Afvist: {deletion.rejection_legal_reason}</div>
              )}
              <p className="text-xs text-muted-foreground pt-2">
                Bemærk: Fakturaer, opgørelser og bogføringsdata bevares i den lovpligtige opbevaringsperiode (typisk 5 år),
                men personoplysninger anonymiseres hvor det er tilladt.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm">
                Sletning deaktiverer din konto med det samme, afmelder marketing og annullerer aktive sessioner.
                Endelig sletning eller anonymisering sker efter 30 dage, hvis der ikke er verserende tvister eller udestående udbetalinger.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Anmod om sletning</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Slet konto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Din konto deaktiveres straks. Handlingen kan ikke fortrydes efter opbevaringsperioden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Fortryd</AlertDialogCancel>
                    <AlertDialogAction onClick={() => requestDeletion("user_initiated")}>
                      Ja, slet min konto
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Opbevaringsregler</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>SMS-koder: 7 dage · Notifikationer: 90 dage · Eksportfiler: 7 dage</p>
          <p>Support: 2 år (anonymiseres) · Bookinger: 5 år (anonymiseres) · Bilag & fakturaer: 10 år (arkiveres)</p>
          <p>Revisionslog: 7 år (uændret jf. lovkrav)</p>
        </CardContent>
      </Card>
    </div>
  );
}
