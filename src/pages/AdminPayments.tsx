import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { countries } from "@/lib/countries";
import { RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

type Booking = {
  id: string;
  service: string;
  hours: number | null;
  customer_pays: number | null;
  provider_gets: number | null;
  platform_fee_amount: number | null;
  currency: string | null;
  payment_intent_id: string | null;
  payment_status: string | null;
  provider_stripe_account_id: string | null;
  status: string;
  created_at: string;
  provider_name: string | null;
};

type WebhookEvent = {
  event_type: string;
  payment_intent_id: string | null;
  transfer_id: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
  booking_id: string | null;
  payload: any;
};

const DEFAULT_FEE_PCT = 28; // memory: 28% total platform fee
const FEE_TOLERANCE_PCT = 1; // ±1 pp acceptable
const DEFAULT_MAX_MULTIPLIER = 3; // max acceptable hourly rate = min * multiplier (AI/market upper bound)

function countryByCurrency(currency: string | null) {
  if (!currency) return null;
  const cur = currency.toUpperCase();
  // EUR is shared; we can't pinpoint country from currency alone
  if (cur === "EUR") return null;
  return countries.find((c) => c.currency === cur) ?? null;
}

function fmtMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  const v = amount / 100;
  return `${v.toFixed(2)} ${(currency ?? "").toUpperCase()}`;
}

export default function AdminPayments() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expectedFee, setExpectedFee] = useState<number>(DEFAULT_FEE_PCT);
  const [maxMultiplier, setMaxMultiplier] = useState<number>(DEFAULT_MAX_MULTIPLIER);
  const [filter, setFilter] = useState<"all" | "ok" | "fee_off" | "market_low" | "market_high" | "no_transfer">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [bRes, eRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, service, hours, customer_pays, provider_gets, platform_fee_amount, currency, payment_intent_id, payment_status, provider_stripe_account_id, status, created_at, provider_name")
        .not("payment_intent_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("stripe_webhook_events")
        .select("event_type, payment_intent_id, transfer_id, amount, currency, created_at, booking_id, payload")
        .or("event_type.like.transfer.%,event_type.like.payment_intent.%")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (bRes.data) setBookings(bRes.data as Booking[]);
    if (eRes.data) setEvents(eRes.data as WebhookEvent[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    return bookings.map((b) => {
      const country = countryByCurrency(b.currency);
      const cp = b.customer_pays ?? 0;
      const pg = b.provider_gets ?? 0;
      const fee = b.platform_fee_amount ?? 0;
      const splitSum = pg + fee;
      const splitOk = cp > 0 && Math.abs(splitSum - cp) <= 1; // ≤ 1 cent rounding
      const effectiveFeePct = cp > 0 ? (fee / cp) * 100 : 0;
      const feeDelta = effectiveFeePct - expectedFee;
      const feeOk = cp > 0 && Math.abs(feeDelta) <= FEE_TOLERANCE_PCT;

      // Market price check: hourly customer price vs min hourly rate
      const hourlyToCustomer = b.hours && b.hours > 0 ? (cp / 100) / Number(b.hours) : null;
      // provider effective hourly take
      const hourlyToProvider = b.hours && b.hours > 0 ? (pg / 100) / Number(b.hours) : null;
      const minRate = country?.minHourlyRate ?? null;
      const maxRate = minRate != null ? minRate * maxMultiplier : null;
      // Deviation = (actual provider hourly - min) / min  (positive = above min, negative = under)
      const marketDeviationPct =
        hourlyToProvider != null && minRate ? ((hourlyToProvider - minRate) / minRate) * 100 : null;
      const marketLow = !!(country && hourlyToProvider != null && minRate != null && hourlyToProvider < minRate);
      const marketHigh = !!(country && hourlyToProvider != null && maxRate != null && hourlyToProvider > maxRate);
      const marketOk = !marketLow && !marketHigh;

      // Auto split: find transfer event for this booking / payment_intent
      const transferEv = events.find(
        (e) =>
          e.event_type.startsWith("transfer.") &&
          (e.booking_id === b.id ||
            (b.payment_intent_id && e.payload?.data?.object?.source_transaction === b.payment_intent_id) ||
            (b.payment_intent_id && e.payload?.data?.object?.transfer_group?.includes?.(b.payment_intent_id))),
      );
      const transferAmount = transferEv?.amount ?? null;
      const transferMatchesProvider = transferAmount != null && Math.abs(transferAmount - pg) <= 1;
      const transferOk = !b.provider_stripe_account_id ? true : transferEv != null && transferMatchesProvider;

      let bucket: "ok" | "fee_off" | "market_low" | "market_high" | "no_transfer" = "ok";
      if (!feeOk || !splitOk) bucket = "fee_off";
      else if (marketLow) bucket = "market_low";
      else if (marketHigh) bucket = "market_high";
      else if (!transferOk) bucket = "no_transfer";

      return {
        b, country, cp, pg, fee, splitOk, effectiveFeePct, feeOk, feeDelta,
        hourlyToCustomer, hourlyToProvider, minRate, maxRate, marketDeviationPct,
        marketOk, marketLow, marketHigh,
        transferEv, transferAmount, transferOk, transferMatchesProvider,
        bucket,
      };
    });
  }, [bookings, events, expectedFee, maxMultiplier]);

  const filtered = rows.filter((r) => filter === "all" || r.bucket === filter);

  const stats = useMemo(() => {
    const total = rows.length;
    const okCount = rows.filter((r) => r.bucket === "ok").length;
    const feeOff = rows.filter((r) => r.bucket === "fee_off").length;
    const marketLow = rows.filter((r) => r.bucket === "market_low").length;
    const marketHigh = rows.filter((r) => r.bucket === "market_high").length;
    const noTransfer = rows.filter((r) => r.bucket === "no_transfer").length;
    const sumCustomer = rows.reduce((a, r) => a + r.cp, 0);
    const sumProvider = rows.reduce((a, r) => a + r.pg, 0);
    const sumFee = rows.reduce((a, r) => a + r.fee, 0);
    const avgFeePct = sumCustomer > 0 ? (sumFee / sumCustomer) * 100 : 0;
    return { total, okCount, feeOff, marketLow, marketHigh, noTransfer, sumCustomer, sumProvider, sumFee, avgFeePct };
  }, [rows]);

  // Group by currency for per-country aggregation
  const byCurrency = useMemo(() => {
    const map = new Map<string, {
      count: number; sumCustomer: number; sumProvider: number; sumFee: number;
      sumHours: number; lowCount: number; highCount: number;
    }>();
    rows.forEach((r) => {
      const k = (r.b.currency ?? "?").toUpperCase();
      const cur = map.get(k) ?? { count: 0, sumCustomer: 0, sumProvider: 0, sumFee: 0, sumHours: 0, lowCount: 0, highCount: 0 };
      cur.count++;
      cur.sumCustomer += r.cp;
      cur.sumProvider += r.pg;
      cur.sumFee += r.fee;
      cur.sumHours += Number(r.b.hours ?? 0);
      if (r.marketLow) cur.lowCount++;
      if (r.marketHigh) cur.highCount++;
      map.set(k, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].sumCustomer - a[1].sumCustomer);
  }, [rows]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif">Betalingsverifikation</h1>
            <p className="text-muted-foreground text-sm">
              Auto split payments, platform-gebyr og markedspris pr. land
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/admin">Tilbage</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/webhooks">Webhooks</Link></Button>
            <Button onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Genindlæs
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">Bookinger</p>
            <p className="text-2xl font-serif">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">OK</p>
            <p className="text-2xl font-serif text-emerald-600">{stats.okCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">Gebyr afv.</p>
            <p className="text-2xl font-serif text-orange-600">{stats.feeOff}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">Under min</p>
            <p className="text-2xl font-serif text-amber-600">{stats.marketLow}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">Over max</p>
            <p className="text-2xl font-serif text-fuchsia-600">{stats.marketHigh}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">Ingen transfer</p>
            <p className="text-2xl font-serif text-red-600">{stats.noTransfer}</p>
          </CardContent></Card>
        </div>

        {/* Config + summary */}
        <Card>
          <CardHeader>
            <CardTitle>Konfiguration</CardTitle>
            <CardDescription>
              Forventet platform-gebyr i procent af kundeprisen. Bookinger der afviger mere end ±{FEE_TOLERANCE_PCT} pp markeres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="fee">Forventet gebyr (%)</Label>
                <Input
                  id="fee" type="number" step="0.5" min={0} max={100}
                  value={expectedFee}
                  onChange={(e) => setExpectedFee(Number(e.target.value) || 0)}
                  className="w-32"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max">Max-faktor (× min timeløn)</Label>
                <Input
                  id="max" type="number" step="0.1" min={1} max={20}
                  value={maxMultiplier}
                  onChange={(e) => setMaxMultiplier(Number(e.target.value) || 1)}
                  className="w-32"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Faktisk gns. gebyr:{" "}
                <span className="font-semibold text-foreground">{stats.avgFeePct.toFixed(2)}%</span>
              </div>
            </div>

            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Total kunde betalt:</span> {(stats.sumCustomer / 100).toLocaleString()} (cent enheder)</p>
              <p><span className="text-muted-foreground">Total til providere:</span> {(stats.sumProvider / 100).toLocaleString()}</p>
              <p><span className="text-muted-foreground">Total platform-gebyr:</span> {(stats.sumFee / 100).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Per currency */}
        <Card>
          <CardHeader>
            <CardTitle>Pr. valuta / land</CardTitle>
            <CardDescription>Aggregeret omsætning og min. timeløn pr. land</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Valuta</th>
                    <th className="py-2 pr-3">Land</th>
                    <th className="py-2 pr-3">Bookinger</th>
                    <th className="py-2 pr-3">Kunde i alt</th>
                    <th className="py-2 pr-3">Provider i alt</th>
                    <th className="py-2 pr-3">Gebyr</th>
                    <th className="py-2 pr-3">Markedsspænd (min–max)</th>
                    <th className="py-2 pr-3">Faktisk timeløn (gns)</th>
                    <th className="py-2 pr-3">Afvigelse vs. marked</th>
                    <th className="py-2 pr-3">Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {byCurrency.map(([cur, v]) => {
                    const c = countries.find((c) => c.currency === cur);
                    const minR = c?.minHourlyRate ?? null;
                    const maxR = minR != null ? minR * maxMultiplier : null;
                    const actualHourly = v.sumHours > 0 ? (v.sumProvider / 100) / v.sumHours : null;
                    const deviationPct =
                      actualHourly != null && minR ? ((actualHourly - minR) / minR) * 100 : null;
                    const flagged = v.lowCount + v.highCount;
                    const aboveMax = actualHourly != null && maxR != null && actualHourly > maxR;
                    const belowMin = actualHourly != null && minR != null && actualHourly < minR;
                    const devClass = belowMin
                      ? "text-amber-600"
                      : aboveMax
                      ? "text-fuchsia-600"
                      : "text-emerald-600";
                    return (
                      <tr key={cur} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono">{cur}</td>
                        <td className="py-2 pr-3">{c ? `${c.flag} ${c.name}` : (cur === "EUR" ? "EU (flere)" : "—")}</td>
                        <td className="py-2 pr-3">{v.count}</td>
                        <td className="py-2 pr-3">{(v.sumCustomer / 100).toLocaleString()} {cur}</td>
                        <td className="py-2 pr-3">{(v.sumProvider / 100).toLocaleString()} {cur}</td>
                        <td className="py-2 pr-3">{(v.sumFee / 100).toLocaleString()} {cur}</td>
                        <td className="py-2 pr-3">{c ? `${minR}–${maxR?.toFixed(0)} ${c.currencySymbol}/t` : "—"}</td>
                        <td className="py-2 pr-3">{actualHourly != null ? `${actualHourly.toFixed(1)} ${c?.currencySymbol ?? cur}/t` : "—"}</td>
                        <td className={`py-2 pr-3 font-semibold ${devClass}`}>
                          {deviationPct != null ? `${deviationPct > 0 ? "+" : ""}${deviationPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          {flagged > 0 ? (
                            <Badge className="bg-orange-500 text-white">
                              {flagged} ({v.lowCount}↓ / {v.highCount}↑)
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {byCurrency.length === 0 && (
                    <tr><td className="py-6 text-muted-foreground text-center" colSpan={8}>Ingen betalinger endnu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bookings list */}
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Bookinger med betaling</CardTitle>
            <div className="flex flex-wrap gap-2">
              {([
                ["all", "Alle"],
                ["ok", "OK"],
                ["fee_off", "Gebyr afviger"],
                ["market_low", "Under markedspris"],
                ["no_transfer", "Mangler transfer"],
              ] as const).map(([k, label]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={filter === k ? "default" : "outline"}
                  onClick={() => setFilter(k as typeof filter)}
                >{label}</Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loading && bookings.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">Henter...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">Ingen bookinger matcher filteret.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => {
                  const isOpen = expanded === r.b.id;
                  const issues: string[] = [];
                  if (!r.splitOk) issues.push("split ≠ kundepris");
                  if (!r.feeOk) issues.push(`gebyr ${r.effectiveFeePct.toFixed(1)}% (forventet ${expectedFee}%)`);
                  if (!r.marketOk) issues.push(`provider ${r.hourlyToProvider?.toFixed(0)} < min ${r.minRate}`);
                  if (!r.transferOk) issues.push("transfer mangler/forkert");
                  const ok = issues.length === 0;
                  return (
                    <div key={r.b.id} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : r.b.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        {ok ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{r.b.service}</span>
                            <span className="text-xs text-muted-foreground">· {r.b.provider_name ?? "?"}</span>
                            {r.country && <Badge variant="outline">{r.country.flag} {r.country.code}</Badge>}
                            <Badge variant="secondary">{r.b.status}</Badge>
                            {r.b.payment_status && <Badge variant="outline">{r.b.payment_status}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                            <span>Kunde: {fmtMoney(r.cp, r.b.currency)}</span>
                            <span>Provider: {fmtMoney(r.pg, r.b.currency)}</span>
                            <span>Gebyr: {fmtMoney(r.fee, r.b.currency)} ({r.effectiveFeePct.toFixed(1)}%)</span>
                            {r.b.hours && <span>{r.b.hours}t</span>}
                          </div>
                        </div>
                        {!ok && (
                          <span className="text-xs text-orange-600 hidden md:inline">{issues.join(" · ")}</span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="border-t bg-muted/30 p-3 text-xs space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <p className="font-semibold mb-1">Split-check</p>
                              <p>provider_gets + platform_fee = {fmtMoney(r.pg + r.fee, r.b.currency)}</p>
                              <p>customer_pays = {fmtMoney(r.cp, r.b.currency)}</p>
                              <p className={r.splitOk ? "text-emerald-600" : "text-orange-600"}>
                                {r.splitOk ? "✓ Matcher" : "✗ Afviger"}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1">Gebyr-check</p>
                              <p>Effektivt: {r.effectiveFeePct.toFixed(2)}%</p>
                              <p>Forventet: {expectedFee}% (±{FEE_TOLERANCE_PCT}pp)</p>
                              <p className={r.feeOk ? "text-emerald-600" : "text-orange-600"}>
                                {r.feeOk ? "✓ OK" : `✗ Δ ${r.feeDelta > 0 ? "+" : ""}${r.feeDelta.toFixed(2)}pp`}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1">Markedspris</p>
                              <p>Kunde pris/time: {r.hourlyToCustomer?.toFixed(2) ?? "—"} {r.b.currency?.toUpperCase()}</p>
                              <p>Provider pris/time: {r.hourlyToProvider?.toFixed(2) ?? "—"} {r.b.currency?.toUpperCase()}</p>
                              <p>Min ({r.country?.code ?? "?"}): {r.minRate ?? "—"} {r.country?.currencySymbol ?? ""}/t</p>
                              <p className={r.marketOk ? "text-emerald-600" : "text-amber-600"}>
                                {r.marketOk ? "✓ Over min" : "✗ Under min — overenskomstbrud"}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1">Auto split / transfer</p>
                              <p>Provider Stripe konto: {r.b.provider_stripe_account_id ?? "—"}</p>
                              <p>PaymentIntent: <code>{r.b.payment_intent_id}</code></p>
                              {r.transferEv ? (
                                <>
                                  <p>Transfer beløb: {fmtMoney(r.transferAmount, r.transferEv.currency)}</p>
                                  <p className={r.transferMatchesProvider ? "text-emerald-600" : "text-orange-600"}>
                                    {r.transferMatchesProvider ? "✓ Matcher provider_gets" : "✗ Beløb mismatch"}
                                  </p>
                                </>
                              ) : (
                                <p className="text-red-600">Ingen transfer-event registreret</p>
                              )}
                            </div>
                          </div>
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
