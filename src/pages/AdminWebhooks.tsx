import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

type WebhookEvent = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  livemode: boolean;
  payment_intent_id: string | null;
  charge_id: string | null;
  refund_id: string | null;
  transfer_id: string | null;
  payout_id: string | null;
  booking_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  payload: any;
  created_at: string;
};

const PROJECT_URL = "https://qfjgifubavuomwvroahy.supabase.co";
const WEBHOOK_URL = `${PROJECT_URL}/functions/v1/stripe-webhook`;

function categoryOf(type: string): "payment" | "refund" | "transfer" | "payout" | "other" {
  if (type.startsWith("payment_intent.")) return "payment";
  if (type.startsWith("refund.") || type.startsWith("charge.refund") || type === "charge.refunded") return "refund";
  if (type.startsWith("transfer.")) return "transfer";
  if (type.startsWith("payout.")) return "payout";
  return "other";
}

function categoryColor(cat: string) {
  switch (cat) {
    case "payment": return "bg-emerald-600 text-white";
    case "refund": return "bg-orange-500 text-white";
    case "transfer": return "bg-blue-600 text-white";
    case "payout": return "bg-purple-600 text-white";
    default: return "bg-muted text-foreground";
  }
}

function formatAmount(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  const value = amount / 100;
  return `${value.toFixed(2)} ${(currency || "").toUpperCase()}`;
}

export default function AdminWebhooks() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stripe_webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setEvents(data as WebhookEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("stripe_webhook_events_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stripe_webhook_events" },
        (payload) => setEvents((prev) => [payload.new as WebhookEvent, ...prev].slice(0, 200)),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = events.filter((e) => {
    if (filter !== "all" && categoryOf(e.event_type) !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.event_type.toLowerCase().includes(q) ||
        e.stripe_event_id.toLowerCase().includes(q) ||
        (e.payment_intent_id ?? "").toLowerCase().includes(q) ||
        (e.booking_id ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    payment: events.filter((e) => categoryOf(e.event_type) === "payment").length,
    refund: events.filter((e) => categoryOf(e.event_type) === "refund").length,
    transfer: events.filter((e) => categoryOf(e.event_type) === "transfer").length,
    payout: events.filter((e) => categoryOf(e.event_type) === "payout").length,
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif">Stripe webhooks</h1>
            <p className="text-muted-foreground text-sm">Live status på betalinger, refunds og split-payouts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/admin">Tilbage</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/stripe">Stripe nøgler</Link></Button>
            <Button onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Genindlæs
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Webhook endpoint</CardTitle>
            <CardDescription>Tilføj denne URL i Stripe Dashboard → Developers → Webhooks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all">{WEBHOOK_URL}</code>
              <Button size="sm" variant="outline" onClick={copyUrl}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold mb-1">Anbefalede events at lytte på:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>payment_intent.succeeded</li>
                  <li>payment_intent.payment_failed</li>
                  <li>payment_intent.canceled</li>
                  <li>payment_intent.amount_capturable_updated</li>
                </ul>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>charge.refunded</li>
                  <li>refund.updated</li>
                  <li>transfer.created / transfer.updated</li>
                  <li>payout.paid / payout.failed</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["payment", "refund", "transfer", "payout"] as const).map((c) => (
            <Card key={c}>
              <CardContent className="pt-4">
                <p className="text-xs uppercase text-muted-foreground">{c}s</p>
                <p className="text-2xl font-serif">{counts[c]}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Seneste events</CardTitle>
            <div className="flex flex-wrap gap-2">
              {["all", "payment", "refund", "transfer", "payout"].map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={filter === c ? "default" : "outline"}
                  onClick={() => setFilter(c)}
                >{c}</Button>
              ))}
              <Input
                placeholder="Søg event id, pi_..., booking..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="md:ml-auto md:w-64"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading && events.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">Henter events...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">Ingen events endnu. De vises her i realtid når Stripe sender dem.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((e) => {
                  const cat = categoryOf(e.event_type);
                  const isOpen = expanded === e.id;
                  return (
                    <div key={e.id} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <Badge className={categoryColor(cat)}>{cat}</Badge>
                        <span className="font-mono text-xs truncate flex-1">{e.event_type}</span>
                        <span className="text-xs text-muted-foreground hidden md:inline">{formatAmount(e.amount, e.currency)}</span>
                        {e.livemode ? (
                          <Badge variant="default" className="bg-orange-500">LIVE</Badge>
                        ) : (
                          <Badge variant="secondary">TEST</Badge>
                        )}
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {new Date(e.created_at).toLocaleString("da-DK")}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t bg-muted/30 p-3 space-y-2 text-xs">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            <div><span className="text-muted-foreground">Event ID:</span> <code>{e.stripe_event_id}</code></div>
                            {e.payment_intent_id && <div><span className="text-muted-foreground">PaymentIntent:</span> <code>{e.payment_intent_id}</code></div>}
                            {e.charge_id && <div><span className="text-muted-foreground">Charge:</span> <code>{e.charge_id}</code></div>}
                            {e.refund_id && <div><span className="text-muted-foreground">Refund:</span> <code>{e.refund_id}</code></div>}
                            {e.transfer_id && <div><span className="text-muted-foreground">Transfer:</span> <code>{e.transfer_id}</code></div>}
                            {e.payout_id && <div><span className="text-muted-foreground">Payout:</span> <code>{e.payout_id}</code></div>}
                            {e.booking_id && <div><span className="text-muted-foreground">Booking:</span> <code>{e.booking_id}</code></div>}
                            {e.status && <div><span className="text-muted-foreground">Status:</span> {e.status}</div>}
                          </div>
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">Rå payload</summary>
                            <pre className="mt-2 bg-background p-2 rounded overflow-x-auto max-h-80 text-[10px]">
                              {JSON.stringify(e.payload, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
