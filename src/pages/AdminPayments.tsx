import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { countries } from "@/lib/countries";
import { RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import MarketThresholdsEditor, { type Threshold } from "@/components/MarketThresholdsEditor";
import { useUserRoles } from "@/hooks/useUserRoles";

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
  const { t } = useTranslation("admin");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [expectedFee, setExpectedFee] = useState<number>(DEFAULT_FEE_PCT);
  const [filter, setFilter] = useState<"all" | "ok" | "fee_off" | "market_low" | "market_high" | "no_transfer">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { isAdmin } = useUserRoles();

  // For a booking we look up thresholds by currency. Multiple countries share EUR — collapse to broadest (lowest min, highest max).
  const currencyThresholds = useMemo(() => {
    const map = new Map<string, { min: number; max: number; codes: string[] }>();
    thresholds.forEach((t) => {
      const cur = t.currency.toUpperCase();
      const ex = map.get(cur);
      if (!ex) map.set(cur, { min: Number(t.min_hourly_rate), max: Number(t.max_hourly_rate), codes: [t.country_code] });
      else {
        ex.min = Math.min(ex.min, Number(t.min_hourly_rate));
        ex.max = Math.max(ex.max, Number(t.max_hourly_rate));
        ex.codes.push(t.country_code);
      }
    });
    return map;
  }, [thresholds]);

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
      const curKey = (b.currency ?? "").toUpperCase();
      const t = currencyThresholds.get(curKey);
      const minRate = t?.min ?? null;
      const maxRate = t?.max ?? null;
      // Deviation = (actual provider hourly - min) / min  (positive = above min, negative = under)
      const marketDeviationPct =
        hourlyToProvider != null && minRate ? ((hourlyToProvider - minRate) / minRate) * 100 : null;
      const marketLow = !!(hourlyToProvider != null && minRate != null && hourlyToProvider < minRate);
      const marketHigh = !!(hourlyToProvider != null && maxRate != null && hourlyToProvider > maxRate);
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
  }, [bookings, events, expectedFee, currencyThresholds]);

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

  const filterOptions = [
    ["all", t("ops.payments.bookings.filters.all")],
    ["ok", t("ops.payments.bookings.filters.ok")],
    ["fee_off", t("ops.payments.bookings.filters.feeOff")],
    ["market_low", t("ops.payments.bookings.filters.marketLow")],
    ["market_high", t("ops.payments.bookings.filters.marketHigh")],
    ["no_transfer", t("ops.payments.bookings.filters.noTransfer")],
  ] as const;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-serif">{t("ops.payments.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("ops.payments.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/admin">{t("ops.payments.back")}</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/webhooks">{t("ops.payments.webhooksLink")}</Link></Button>
            <Button onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />{t("ops.payments.reload")}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">{t("ops.payments.stats.bookings")}</p>
            <p className="text-2xl font-serif">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">{t("ops.payments.stats.ok")}</p>
            <p className="text-2xl font-serif text-emerald-600">{stats.okCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">{t("ops.payments.stats.feeOff")}</p>
            <p className="text-2xl font-serif text-orange-600">{stats.feeOff}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">{t("ops.payments.stats.underMin")}</p>
            <p className="text-2xl font-serif text-amber-600">{stats.marketLow}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">{t("ops.payments.stats.overMax")}</p>
            <p className="text-2xl font-serif text-fuchsia-600">{stats.marketHigh}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs uppercase text-muted-foreground">{t("ops.payments.stats.noTransfer")}</p>
            <p className="text-2xl font-serif text-red-600">{stats.noTransfer}</p>
          </CardContent></Card>
        </div>

        {/* Config + summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t("ops.payments.config.title")}</CardTitle>
            <CardDescription>
              {t("ops.payments.config.description", { tolerance: FEE_TOLERANCE_PCT })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="fee">{t("ops.payments.config.feeLabel")}</Label>
                <Input
                  id="fee" type="number" step="0.5" min={0} max={100}
                  value={expectedFee}
                  onChange={(e) => setExpectedFee(Number(e.target.value) || 0)}
                  className="w-32"
                />
              </div>
              <div className="text-xs text-muted-foreground max-w-md">
                {t("ops.payments.config.thresholdsHint")}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("ops.payments.config.actualAvgFee")}{" "}
                <span className="font-semibold text-foreground">{stats.avgFeePct.toFixed(2)}%</span>
              </div>
            </div>

            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">{t("ops.payments.config.totalCustomer")}</span> {(stats.sumCustomer / 100).toLocaleString()} {t("ops.payments.config.centUnits")}</p>
              <p><span className="text-muted-foreground">{t("ops.payments.config.totalProvider")}</span> {(stats.sumProvider / 100).toLocaleString()}</p>
              <p><span className="text-muted-foreground">{t("ops.payments.config.totalFee")}</span> {(stats.sumFee / 100).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Per currency */}
        <Card>
          <CardHeader>
            <CardTitle>{t("ops.payments.byCurrency.title")}</CardTitle>
            <CardDescription>{t("ops.payments.byCurrency.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.currency")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.country")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.bookings")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.customerTotal")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.providerTotal")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.fee")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.marketSpread")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.actualHourly")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.deviation")}</th>
                    <th className="py-2 pr-3">{t("ops.payments.byCurrency.headers.flagged")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byCurrency.map(([cur, v]) => {
                    const c = countries.find((c) => c.currency === cur);
                    const t2 = currencyThresholds.get(cur);
                    const minR = t2?.min ?? null;
                    const maxR = t2?.max ?? null;
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
                        <td className="py-2 pr-3">{c ? `${c.flag} ${c.name}` : (cur === "EUR" ? t("ops.payments.byCurrency.euMultiple") : "—")}</td>
                        <td className="py-2 pr-3">{v.count}</td>
                        <td className="py-2 pr-3">{(v.sumCustomer / 100).toLocaleString()} {cur}</td>
                        <td className="py-2 pr-3">{(v.sumProvider / 100).toLocaleString()} {cur}</td>
                        <td className="py-2 pr-3">{(v.sumFee / 100).toLocaleString()} {cur}</td>
                        <td className="py-2 pr-3">{minR != null && maxR != null ? `${minR}–${maxR.toFixed(0)} ${c?.currencySymbol ?? cur}/t` : "—"}</td>
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
                    <tr><td className="py-6 text-muted-foreground text-center" colSpan={11}>{t("ops.payments.byCurrency.empty")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bookings list */}
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>{t("ops.payments.bookings.title")}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {filterOptions.map(([k, label]) => (
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
              <p className="text-muted-foreground text-sm py-6 text-center">{t("ops.payments.bookings.loading")}</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">{t("ops.payments.bookings.noneMatch")}</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => {
                  const isOpen = expanded === r.b.id;
                  const issues: string[] = [];
                  if (!r.splitOk) issues.push(t("ops.payments.issues.splitMismatch"));
                  if (!r.feeOk) issues.push(t("ops.payments.issues.feeIssue", { pct: r.effectiveFeePct.toFixed(1), expected: expectedFee }));
                  if (r.marketLow) issues.push(t("ops.payments.issues.marketLow", { value: r.hourlyToProvider?.toFixed(0), min: r.minRate }));
                  if (r.marketHigh) issues.push(t("ops.payments.issues.marketHigh", { value: r.hourlyToProvider?.toFixed(0), max: r.maxRate?.toFixed(0) }));
                  if (!r.transferOk) issues.push(t("ops.payments.issues.transferIssue"));
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
                            <span className="text-xs text-muted-foreground">· {r.b.provider_name ?? t("ops.payments.row.unknownProvider")}</span>
                            {r.country && <Badge variant="outline">{r.country.flag} {r.country.code}</Badge>}
                            <Badge variant="secondary">{r.b.status}</Badge>
                            {r.b.payment_status && <Badge variant="outline">{r.b.payment_status}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                            <span>{t("ops.payments.row.customerPayment")} {fmtMoney(r.cp, r.b.currency)}</span>
                            <span>{t("ops.payments.row.providerEarning")} {fmtMoney(r.pg, r.b.currency)}</span>
                            <span>{t("ops.payments.row.platformFee")} {fmtMoney(r.fee, r.b.currency)} ({r.effectiveFeePct.toFixed(1)}%)</span>
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
                              <p className="font-semibold mb-1">{t("ops.payments.detail.splitCheckTitle")}</p>
                              <p>provider_gets + platform_fee = {fmtMoney(r.pg + r.fee, r.b.currency)}</p>
                              <p>{t("ops.payments.detail.customerPays", { value: fmtMoney(r.cp, r.b.currency) })}</p>
                              <p className={r.splitOk ? "text-emerald-600" : "text-orange-600"}>
                                {r.splitOk ? t("ops.payments.detail.matches") : t("ops.payments.detail.deviates")}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1">{t("ops.payments.detail.feeCheckTitle")}</p>
                              <p>{t("ops.payments.detail.effective", { value: r.effectiveFeePct.toFixed(2) })}</p>
                              <p>{t("ops.payments.detail.expected", { value: expectedFee, tolerance: FEE_TOLERANCE_PCT })}</p>
                              <p className={r.feeOk ? "text-emerald-600" : "text-orange-600"}>
                                {r.feeOk ? t("ops.payments.detail.feeOk") : t("ops.payments.detail.feeDeviation", { value: `${r.feeDelta > 0 ? "+" : ""}${r.feeDelta.toFixed(2)}` })}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1">{t("ops.payments.detail.marketTitle")}</p>
                              <p>{t("ops.payments.detail.totalPricePerHour", { value: `${r.hourlyToCustomer?.toFixed(2) ?? "—"} ${r.b.currency?.toUpperCase() ?? ""}` })}</p>
                              <p>{t("ops.payments.detail.providerPricePerHour", { value: `${r.hourlyToProvider?.toFixed(2) ?? "—"} ${r.b.currency?.toUpperCase() ?? ""}` })}</p>
                              <p>{t("ops.payments.detail.spread", { code: r.country?.code ?? "?", min: r.minRate ?? "—", max: r.maxRate?.toFixed(0) ?? "—", symbol: r.country?.currencySymbol ?? "" })}</p>
                              {r.marketDeviationPct != null && (
                                <p>{t("ops.payments.detail.deviationVsMin")} <span className="font-semibold">{r.marketDeviationPct > 0 ? "+" : ""}{r.marketDeviationPct.toFixed(1)}%</span></p>
                              )}
                              <p className={
                                r.marketLow ? "text-amber-600"
                                : r.marketHigh ? "text-fuchsia-600"
                                : "text-emerald-600"
                              }>
                                {r.marketLow ? t("ops.payments.detail.underMinBreach")
                                  : r.marketHigh ? t("ops.payments.detail.overMaxOutlier")
                                  : t("ops.payments.detail.withinSpread")}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1">{t("ops.payments.detail.transferTitle")}</p>
                              <p>{t("ops.payments.detail.providerStripeAccount", { value: r.b.provider_stripe_account_id ?? "—" })}</p>
                              <p>PaymentIntent: <code>{r.b.payment_intent_id}</code></p>
                              {r.transferEv ? (
                                <>
                                  <p>{t("ops.payments.detail.transferredAmount", { value: fmtMoney(r.transferAmount, r.transferEv.currency) })}</p>
                                  <p className={r.transferMatchesProvider ? "text-emerald-600" : "text-orange-600"}>
                                    {r.transferMatchesProvider ? t("ops.payments.detail.transferMatches") : t("ops.payments.detail.transferMismatch")}
                                  </p>
                                </>
                              ) : (
                                <p className="text-red-600">{t("ops.payments.detail.noTransferEvent")}</p>
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

        {/* Editable thresholds */}
        <MarketThresholdsEditor canEdit={isAdmin} onLoaded={setThresholds} />
      </div>
    </div>
  );
}
