import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, FileText, Clock } from "lucide-react";
import BackButton from "@/components/BackButton";

interface Dispute {
  id: string;
  stripe_dispute_id: string;
  booking_id: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  outcome: string | null;
  evidence_due_by: string | null;
  has_evidence: boolean;
  closed_at: string | null;
  created_at: string;
}

interface Evidence {
  id: string;
  kind: string;
  file_name: string | null;
  note: string | null;
  stripe_field: string | null;
  submitted_to_stripe_at: string | null;
  created_at: string;
}

const statusColor = (s: string) => {
  if (s === "won") return "default";
  if (s === "lost" || s === "charge_refunded") return "destructive";
  if (s.includes("closed")) return "secondary";
  return "outline";
};

function hoursLeft(iso: string | null) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
}

export default function ProviderDisputes() {
  const { id } = useParams();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stripeField, setStripeField] = useState("service_documentation");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("stripe_disputes").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        setDisputes((data ?? []) as Dispute[]);
        if (id) setSelected((data ?? []).find((d: Dispute) => d.id === id) ?? null);
      });
  }, [id]);

  useEffect(() => {
    if (!selected) return;
    supabase.from("dispute_evidence").select("*")
      .eq("dispute_id", selected.id).order("created_at", { ascending: false })
      .then(({ data }) => setEvidence((data ?? []) as Evidence[]));
  }, [selected]);

  const upload = async () => {
    if (!selected) return;
    if (!file && !note.trim()) { toast.error("Vedhæft en fil eller skriv en beskrivelse, før du uploader."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("dispute_id", selected.id);
      if (file) fd.append("file", file);
      if (note.trim()) fd.append("note", note.trim());
      fd.append("stripe_field", stripeField);
      const { data, error } = await supabase.functions.invoke("dispute-evidence-upload", { body: fd });
      if (error) throw error;
      toast.success("Din dokumentation er gemt på sagen.");
      setNote(""); setFile(null);
      const { data: refreshed } = await supabase.from("dispute_evidence").select("*")
        .eq("dispute_id", selected.id).order("created_at", { ascending: false });
      setEvidence((refreshed ?? []) as Evidence[]);
    } catch (e: any) {
      toast.error("Dokumentationen blev ikke uploadet. Kontrollér filen og din forbindelse, og prøv igen.");
    } finally { setBusy(false); }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <BackButton />
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-orange-500" />
        <h1 className="text-3xl font-serif">Indsigelser på betalinger</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle>Mine indsigelsessager</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {disputes.length === 0 && <p className="text-sm text-muted-foreground">Der er ingen indsigelser på dine betalinger lige nu.</p>}
            {disputes.map((d) => {
              const hl = hoursLeft(d.evidence_due_by);
              return (
                <button key={d.id} onClick={() => setSelected(d)}
                  className={`w-full text-left p-3 rounded border transition ${selected?.id === d.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-mono">{d.stripe_dispute_id.slice(0, 14)}…</span>
                    <Badge variant={statusColor(d.status) as any}>{d.status}</Badge>
                  </div>
                  <div className="text-sm mt-1">{(d.amount / 100).toFixed(2)} {d.currency}</div>
                  {hl !== null && hl > 0 && !d.closed_at && (
                    <div className="flex items-center gap-1 text-xs text-orange-600 mt-1">
                      <Clock className="h-3 w-3" /> {hl}t tilbage
                    </div>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          {!selected ? (
            <CardContent className="p-8 text-center text-muted-foreground">Vælg en sag i listen for at se detaljerne.</CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Sag {selected.stripe_dispute_id}</CardTitle>
                <div className="text-sm text-muted-foreground space-y-1 mt-2">
                  <div>Beløb i sagen: <strong>{(selected.amount / 100).toFixed(2)} {selected.currency}</strong></div>
                  <div>Angivet årsag: {selected.reason ?? "—"}</div>
                  <div>Status: <Badge variant={statusColor(selected.status) as any}>{selected.status}</Badge></div>
                  {selected.outcome && <div>Udfald: <strong>{selected.outcome}</strong></div>}
                  {selected.evidence_due_by && (
                    <div>Svarfrist: <strong>{new Date(selected.evidence_due_by).toLocaleString("da-DK")}</strong></div>
                  )}
                  {selected.booking_id && (
                    <div><Link className="underline" to={`/mine-bookinger`}>Se booking</Link></div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!selected.closed_at && (
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/40">
                    <h3 className="font-semibold">Upload dokumentation</h3>
                    <p className="text-xs text-muted-foreground">
                      Der er oprettet en sag om denne booking. Beskriv neutralt og faktuelt, hvad der er sket, og vedhæft den dokumentation, du har. Oplysningerne fra begge parter indgår i vurderingen.
                    </p>
                    <div>
                      <Label>Kategori</Label>
                      <select value={stripeField} onChange={(e) => setStripeField(e.target.value)}
                        className="w-full border rounded px-3 py-2 bg-background">
                        <option value="service_documentation">Dokumentation for udført service</option>
                        <option value="receipt">Kvittering</option>
                        <option value="customer_communication">Kommunikation med kunden</option>
                        <option value="shipping_documentation">Dokumentation for adgang til adressen</option>
                        <option value="uncategorized_file">Andet</option>
                      </select>
                    </div>
                    <div>
                      <Label>Fil (PDF, JPG, PNG)</Label>
                      <Input type="file" accept=".pdf,image/*"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </div>
                    <div>
                      <Label>Din beskrivelse af sagen</Label>
                      <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                        rows={4} placeholder="Beskriv kort og faktuelt, hvad der er sket…" />
                    </div>
                    <Button onClick={upload} disabled={busy}>
                      {busy ? "Gemmer…" : "Upload dokumentation"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      MyCleaner videresender den samlede dokumentation til betalingsudbyderen inden svarfristen. Udfaldet af en indsigelse afgøres af kundens bank eller kortudsteder.
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="font-semibold mb-2">Uploadet dokumentation ({evidence.length})</h3>
                  {evidence.length === 0 && <p className="text-sm text-muted-foreground">Der er endnu ikke uploadet dokumentation på denne sag.</p>}
                  <ul className="space-y-2">
                    {evidence.map((e) => (
                      <li key={e.id} className="flex items-start gap-2 text-sm border rounded p-2">
                        <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          {e.file_name && <div className="font-medium">{e.file_name}</div>}
                          {e.note && <div className="text-muted-foreground">{e.note}</div>}
                          <div className="text-xs text-muted-foreground mt-1">
                            {e.stripe_field ?? e.kind} · {new Date(e.created_at).toLocaleString("da-DK")}
                            {e.submitted_to_stripe_at && " · sendt til betalingsudbyderen"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
