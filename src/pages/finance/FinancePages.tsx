import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Wallet, Receipt, Percent, RefreshCcw, FileText } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { formatMoney, formatDate, type FinanceSummary, type CurrencyTotals, type PayoutCurrencyTotals } from "@/lib/finance";
import { RoleGuard } from "@/components/RoleGuard";
import { InvoicesPanel } from "@/components/finance/InvoicesPanel";

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

function CurrencyBlock({
  scope,
  totals,
  payouts,
}: {
  scope: "provider" | "admin";
  totals: CurrencyTotals;
  payouts?: PayoutCurrencyTotals;
}) {
  const cur = totals.currency;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-serif">Totaler i {cur}</h2>
        <Badge variant="outline">{cur}</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          label={scope === "admin" ? "Netto omsætning" : "Din netto omsætning"}
          value={formatMoney(totals.gross_revenue, cur)}
          icon={TrendingUp}
          hint={`${totals.bookings_count} bookinger • Refundering ${formatMoney(totals.refunded_amount, cur)}`}
        />
        <KPI
          label={scope === "admin" ? "Platformgebyr" : "Platformgebyr"}
          value={formatMoney(totals.platform_commission, cur)}
          icon={Percent}
          hint="Justeret for refunderinger"
        />
        <KPI
          label={scope === "admin" ? "Providerens indtjening" : "Din indtjening"}
          value={formatMoney(totals.provider_net, cur)}
          icon={Receipt}
          hint="Justeret for refunderinger"
        />
        <KPI
          label="Gennemført udbetaling"
          value={formatMoney(payouts?.paid ?? 0, cur)}
          icon={Wallet}
          hint={`Planlagt udbetaling: ${formatMoney(payouts?.in_transit ?? 0, cur)}`}
        />
      </div>
    </section>
  );
}

function FinanceView({ scope, title }: { scope: "provider" | "admin"; title: string }) {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke(
      `finance-summary?scope=${scope}`,
      { method: "GET" as any },
    );
    if (err) setError(err.message);
    else setData(res as FinanceSummary);
    setLoading(false);
  }

  useEffect(() => { load(); }, [scope]);

  async function generateStatements() {
    setGenerating(true);
    const { data: res, error: err } = await supabase.functions.invoke(
      "finance-generate-statements",
      { method: "POST" as any },
    );
    setGenerating(false);
    if (err) toast.error(err.message);
    else toast.success(`Genereret ${(res as any)?.statements_generated ?? 0} månedlige opgørelser`);
  }

  const payoutsByCur = new Map(
    (data?.payouts.totals_by_currency ?? []).map((p) => [p.currency, p]),
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-3xl font-serif">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="h-4 w-4 mr-1" /> Opdater
          </Button>
          {scope === "admin" && (
            <Button size="sm" onClick={generateStatements} disabled={generating}>
              <FileText className="h-4 w-4 mr-1" />
              {generating ? "Genererer…" : "Generér forrige måned"}
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Indlæser…
        </div>
      )}
      {error && <div className="text-destructive text-sm">{error}</div>}

      {data && (
        <>
          {data.totals_by_currency.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              Ingen betalte bookinger endnu i nogen valuta.
            </CardContent></Card>
          ) : (
            data.totals_by_currency.map((t) => (
              <CurrencyBlock key={t.currency} scope={scope} totals={t} payouts={payoutsByCur.get(t.currency)} />
            ))
          )}

          <Card>
            <CardHeader><CardTitle>Månedlig oversigt (per valuta)</CardTitle></CardHeader>
            <CardContent>
              {data.monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen betalte bookinger endnu.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Måned</TableHead>
                      <TableHead>Valuta</TableHead>
                      <TableHead className="text-right">Bookinger</TableHead>
                      <TableHead className="text-right">Samlet pris (efter refundering)</TableHead>
                      <TableHead className="text-right">Refundering</TableHead>
                      <TableHead className="text-right">Platformgebyr</TableHead>
                      <TableHead className="text-right">Providerens indtjening</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthly.map((m) => (
                      <TableRow key={`${m.month}-${m.currency}`}>
                        <TableCell className="font-mono">{m.month}</TableCell>
                        <TableCell><Badge variant="outline">{m.currency}</Badge></TableCell>
                        <TableCell className="text-right">{m.count}</TableCell>
                        <TableCell className="text-right">{formatMoney(m.gross, m.currency)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatMoney(m.refunded, m.currency)}</TableCell>
                        <TableCell className="text-right">{formatMoney(m.fee, m.currency)}</TableCell>
                        <TableCell className="text-right">{formatMoney(m.net, m.currency)}</TableCell>
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
                  Der er endnu ingen registrerede udbetalinger. En udbetaling vises her, når den er planlagt eller gennemført.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dato</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Providerens indtjening</TableHead>
                      <TableHead className="text-right">Platformgebyr</TableHead>
                      <TableHead>Valuta</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payouts.items.map((p) => {
                      const ref = (p.metadata as any)?.transaction_reference
                        ?? p.stripe_payout_id ?? p.stripe_transfer_id ?? "—";
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{formatDate(p.arrival_date ?? p.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{p.booking_id?.slice(0, 8) ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{ref}</TableCell>
                          <TableCell className="text-right">{formatMoney(p.net_amount, p.currency)}</TableCell>
                          <TableCell className="text-right">{formatMoney(p.platform_fee_amount, p.currency)}</TableCell>
                          <TableCell><Badge variant="outline">{p.currency}</Badge></TableCell>
                          <TableCell><Badge variant={statusTone(p.status) as any}>{p.status}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <section>
            <h2 className="text-lg font-serif mb-3">Fakturaer & afregningsoversigter</h2>
            <InvoicesPanel scope={scope} />
          </section>

          <p className="text-xs text-muted-foreground">
            Rapport til overblik. Totaler grupperes altid per valuta — vi kombinerer aldrig DKK, EUR, GBP m.fl. i én KPI.
            MyCleaner-platformen formidler kontakten mellem kunder og selvstændige providere og fakturerer alene sit eget platformgebyr;
            provideren er selv ansvarlig for kundefakturering og momsafregning. En planlagt udbetaling er ikke en garanti for et bestemt banktidspunkt —
            hvornår beløbet er synligt på kontoen afhænger af betalingsudbyderen og providerens bank.
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
    <RoleGuard allow={["admin"]}>
      <FinanceView scope="admin" title="Marketplace økonomi" />
    </RoleGuard>
  );
}
