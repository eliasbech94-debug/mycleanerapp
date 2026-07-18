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
      toast.success("Dokumentation sendt til Stripe");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke sende");
    } finally { setBusy(null); }
  };

  const runMonitor = async () => {
    setBusy("monitor");
    try {
      const { data, error } = await supabase.functions.invoke("dispute-monitor", { body: {} });
      if (error) throw error;
      toast.success(`Monitor kørt: ratio ${((data?.platform_ratio ?? 0) * 100).toFixed(2)}%`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Fejl");
    } finally { setBusy(null); }
  };

  const renderList = (items: Dispute[]) => (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-muted-foreground p-4">Ingen sager.</p>}
      {items.map((d) => (
        <div key={d.id} className="border rounded p-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{d.stripe_dispute_id}</span>
              <Badge variant={badge(d.status) as any}>{d.status}</Badge>
              {d.funds_withdrawn_at && <Badge variant="destructive">midler trukket</Badge>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {(d.amount / 100).toFixed(2)} {d.currency} · {d.reason ?? "—"}
              {d.evidence_due_by && ` · frist ${new Date(d.evidence_due_by).toLocaleDateString("da-DK")}`}
            </div>
          </div>
          {!d.closed_at && (
            <Button size="sm" variant="outline" onClick={() => submit(d.id)} disabled={busy === d.id}>
              <Send className="h-3 w-3 mr-1" />
              {busy === d.id ? "Sender…" : "Send til Stripe"}
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
          <h1 className="text-3xl font-serif">Indsigelser & chargebacks</h1>
        </div>
        <Button onClick={runMonitor} disabled={busy === "monitor"} variant="outline">
          Kør monitor nu
        </Button>
      </div>

      {alerts.length > 0 && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardHeader><CardTitle className="text-orange-700">Aktive alarmer ({alerts.length})</CardTitle></CardHeader>
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
          <TabsTrigger value="waiting">Afventer dok. ({groups.waiting.length})</TabsTrigger>
          <TabsTrigger value="escalated">Under review ({groups.escalated.length})</TabsTrigger>
          <TabsTrigger value="won">Vundet ({groups.won.length})</TabsTrigger>
          <TabsTrigger value="lost">Tabt ({groups.lost.length})</TabsTrigger>
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
