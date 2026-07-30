import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { AlertTriangle, Send } from "lucide-react";

interface Dispute {
  id: string;
  stripe_dispute_id: string;
  booking_id: string | null;
  provider_user_id: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  outcome: string | null;
  evidence_due_by: string | null;
  has_evidence: boolean;
  submission_count: number;
  closed_at: string | null;
  funds_withdrawn_at: string | null;
  created_at: string;
}

interface Alert {
  id: string;
  code: string;
  severity: string;
  message: string;
  resolved_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  needs_response: "Afventer oplysninger",
  warning_needs_response: "Afventer oplysninger",
  under_review: "Under gennemgang",
  warning_under_review: "Under gennemgang",
  won: "Afgjort — medhold",
  lost: "Afgjort — ikke medhold",
  charge_refunded: "Refundering gennemført",
  warning_closed: "Afsluttet",
  closed: "Afsluttet",
};

const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

const badge = (s: string) => {
  if (s === "won") return "default";
  if (s === "lost" || s === "charge_refunded") return "destructive";
  return "outline";
};

function group(disputes: Dispute[]) {
  return {
    open: disputes.filter((d) => !d.closed_at && !["won", "lost"].includes(d.status)),
    waiting: disputes.filter((d) => !d.closed_at && !d.has_evidence),
    won: disputes.filter((d) => d.status === "won" || d.outcome === "won"),
    lost: disputes.filter((d) => d.status === "lost" || d.outcome === "lost"),
    escalated: disputes.filter((d) => d.status === "under_review" && d.submission_count > 0),
  };
}

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [{ data: d }, { data: a }] = await Promise.all([
      supabase.from("stripe_disputes").select("*").order("created_at", { ascending: false }),
      supabase.from("dispute_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }),
    ]);
    setDisputes((d ?? []) as Dispute[]);
    setAlerts((a ?? []) as Alert[]);
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => group(disputes), [disputes]);

  const submit = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.functions.invoke("dispute-evidence-submit", { body: { dispute_id: id } });
      if (error) throw error;
      toast.success("Oplysningerne er sendt til betalingsudbyderen");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Oplysningerne kunne ikke sendes. Prøv igen om lidt.");
    } finally { setBusy(null); }
  };

  const runMonitor = async () => {
    setBusy("monitor");
    try {
      const { data, error } = await supabase.functions.invoke("dispute-monitor", { body: {} });
      if (error) throw error;
      toast.success(`Overvågning gennemført — andel: ${((data?.platform_ratio ?? 0) * 100).toFixed(2)}%`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Overvågningen kunne ikke gennemføres. Prøv igen om lidt.");
    } finally { setBusy(null); }
  };

  const renderList = (items: Dispute[]) => (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-muted-foreground p-4">Ingen sager i denne kategori.</p>}
      {items.map((d) => (
        <div key={d.id} className="border rounded p-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{d.stripe_dispute_id}</span>
              <Badge variant={badge(d.status) as any}>{statusLabel(d.status)}</Badge>
              {d.funds_withdrawn_at && <Badge variant="destructive">midler tilbageholdt af betalingsudbyder</Badge>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {(d.amount / 100).toFixed(2)} {d.currency} · {d.reason ?? "—"}
              {d.evidence_due_by && ` · frist for oplysninger ${new Date(d.evidence_due_by).toLocaleDateString("da-DK")}`}
            </div>
          </div>
          {!d.closed_at && (
            <Button size="sm" variant="outline" onClick={() => submit(d.id)} disabled={busy === d.id}>
              <Send className="h-3 w-3 mr-1" />
              {busy === d.id ? "Sender…" : "Send oplysninger"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="container mx-auto py-8 space-y-6">
      <BackButton />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-orange-500" />
          <h1 className="text-3xl font-serif">Indsigelser på betalinger</h1>
        </div>
        <Button onClick={runMonitor} disabled={busy === "monitor"} variant="outline">
          Kør overvågning nu
        </Button>
      </div>

      {alerts.length > 0 && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardHeader><CardTitle className="text-orange-700">Aktive advarsler ({alerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {alerts.map((a) => (
              <div key={a.id} className="text-sm">
                <Badge variant={a.severity === "critical" ? "destructive" : "outline"}>{a.code}</Badge>{" "}
                {a.message}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Åbne ({groups.open.length})</TabsTrigger>
          <TabsTrigger value="waiting">Afventer oplysninger ({groups.waiting.length})</TabsTrigger>
          <TabsTrigger value="escalated">Under gennemgang ({groups.escalated.length})</TabsTrigger>
          <TabsTrigger value="won">Medhold ({groups.won.length})</TabsTrigger>
          <TabsTrigger value="lost">Ikke medhold ({groups.lost.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open"><Card><CardContent className="pt-4">{renderList(groups.open)}</CardContent></Card></TabsContent>
        <TabsContent value="waiting"><Card><CardContent className="pt-4">{renderList(groups.waiting)}</CardContent></Card></TabsContent>
        <TabsContent value="escalated"><Card><CardContent className="pt-4">{renderList(groups.escalated)}</CardContent></Card></TabsContent>
        <TabsContent value="won"><Card><CardContent className="pt-4">{renderList(groups.won)}</CardContent></Card></TabsContent>
        <TabsContent value="lost"><Card><CardContent className="pt-4">{renderList(groups.lost)}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
