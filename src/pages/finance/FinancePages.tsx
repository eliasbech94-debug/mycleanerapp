import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Wallet, Receipt, Percent } from "lucide-react";
import BackButton from "@/components/BackButton";
import { formatMoney, formatDate, type FinanceSummary } from "@/lib/finance";
import { RoleGuard } from "@/components/RoleGuard";

function KPI({ label, value, icon: Icon, hint }: { label: string; value: string; icon: any; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-2xl font-serif mt-1">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function statusTone(s: string) {
  if (s === "paid") return "default";
  if (s === "failed") return "destructive";
  return "secondary";
}

function FinanceView({ scope, title }: { scope: "provider" | "admin"; title: string }) {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: res, error: err } = await supabase.functions.invoke(
        `finance-summary?scope=${scope}`,
        { method: "GET" as any },
      );
      if (cancelled) return;
      if (err) setError(err.message);
      else setData(res as FinanceSummary);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [scope]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-3xl font-serif">{title}</h1>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Indlæser…
        </div>
      )}
      {error && <div className="text-destructive text-sm">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI
              label={scope === "admin" ? "Brutto omsætning" : "Brutto omsætning (dig)"}
              value={formatMoney(data.totals.gross_revenue, data.currency)}
              icon={TrendingUp}
              hint={`${data.totals.bookings_count} betalte bookinger`}
            />
            <KPI
              label={scope === "admin" ? "Platform kommission (28%)" : "Platform-gebyr"}
              value={formatMoney(data.totals.platform_commission, data.currency)}
              icon={Percent}
            />
            <KPI
              label={scope === "admin" ? "Provider netto (72%)" : "Din netto"}
              value={formatMoney(data.totals.provider_net, data.currency)}
              icon={Receipt}
            />
            <KPI
              label="Udbetalt via Stripe"
              value={formatMoney(data.payouts.totals.paid, data.currency)}
              icon={Wallet}
              hint={`Undervejs: ${formatMoney(data.payouts.totals.in_transit, data.currency)}`}
            />
          </div>

          <Card>
            <CardHeader><CardTitle>Månedlig oversigt</CardTitle></CardHeader>
            <CardContent>
              {data.monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen betalte bookinger endnu.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Måned</TableHead>
                      <TableHead className="text-right">Bookinger</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead className="text-right">Kommission</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthly.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-mono">{m.month}</TableCell>
                        <TableCell className="text-right">{m.count}</TableCell>
                        <TableCell className="text-right">{formatMoney(m.gross, data.currency)}</TableCell>
                        <TableCell className="text-right">{formatMoney(m.fee, data.currency)}</TableCell>
                        <TableCell className="text-right">{formatMoney(m.net, data.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Udbetalinger</CardTitle></CardHeader>
            <CardContent>
              {data.payouts.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ingen udbetalinger registreret endnu. Kommer automatisk via Stripe når transfers/payouts sker.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dato</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Gebyr</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payouts.items.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.arrival_date ?? p.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{p.booking_id?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.stripe_payout_id ?? p.stripe_transfer_id ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatMoney(p.net_amount, p.currency)}</TableCell>
                        <TableCell className="text-right">{formatMoney(p.platform_fee_amount, p.currency)}</TableCell>
                        <TableCell><Badge variant={statusTone(p.status) as any}>{p.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Rapport til overblik. MyCleaner udsteder ikke juridiske fakturaer endnu — moms- og fakturafunktioner tilføjes senere.
          </p>
        </>
      )}
    </div>
  );
}

export function ProviderFinance() {
  return (
    <RoleGuard allow={["provider", "admin"]}>
      <FinanceView scope="provider" title="Indtjening & udbetalinger" />
    </RoleGuard>
  );
}

export function AdminFinance() {
  return (
    <RoleGuard allow={["admin", "employee"]}>
      <FinanceView scope="admin" title="Marketplace økonomi" />
    </RoleGuard>
  );
}
