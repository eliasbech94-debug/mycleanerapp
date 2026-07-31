import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("finance");
  const cur = totals.currency;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-serif">{t("ui.financePages.totalsIn", { currency: cur })}</h2>
        <Badge variant="outline">{cur}</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          label={scope === "admin" ? t("ui.financePages.netRevenue") : t("ui.financePages.yourNetRevenue")}
          value={formatMoney(totals.gross_revenue, cur)}
          icon={TrendingUp}
          hint={t("ui.financePages.bookingsRefundHint", { count: totals.bookings_count, amount: formatMoney(totals.refunded_amount, cur) })}
        />
        <KPI
          label={t("ui.financePages.platformFee")}
          value={formatMoney(totals.platform_commission, cur)}
          icon={Percent}
          hint={t("ui.financePages.adjustedForRefunds")}
        />
        <KPI
          label={scope === "admin" ? t("ui.financePages.providerEarnings") : t("ui.financePages.yourEarnings")}
          value={formatMoney(totals.provider_net, cur)}
          icon={Receipt}
          hint={t("ui.financePages.adjustedForRefunds")}
        />
        <KPI
          label={t("ui.financePages.completedPayout")}
          value={formatMoney(payouts?.paid ?? 0, cur)}
          icon={Wallet}
          hint={t("ui.financePages.scheduledPayoutHint", { amount: formatMoney(payouts?.in_transit ?? 0, cur) })}
        />
      </div>
    </section>
  );
}

function FinanceView({ scope, title }: { scope: "provider" | "admin"; title: string }) {
  const { t } = useTranslation("finance");
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
    else toast.success(t("ui.financePages.statementsGenerated", { count: (res as any)?.statements_generated ?? 0 }));
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
            <RefreshCcw className="h-4 w-4 mr-1" /> {t("ui.financePages.refresh")}
          </Button>
          {scope === "admin" && (
            <Button size="sm" onClick={generateStatements} disabled={generating}>
              <FileText className="h-4 w-4 mr-1" />
              {generating ? t("ui.financePages.generating") : t("ui.financePages.generatePreviousMonth")}
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("ui.financePages.loading")}
        </div>
      )}
      {error && <div className="text-destructive text-sm">{error}</div>}

      {data && (
        <>
          {data.totals_by_currency.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              {t("ui.financePages.noPaidBookings")}
            </CardContent></Card>
          ) : (
            data.totals_by_currency.map((t) => (
              <CurrencyBlock key={t.currency} scope={scope} totals={t} payouts={payoutsByCur.get(t.currency)} />
            ))
          )}

          <Card>
            <CardHeader><CardTitle>{t("ui.financePages.monthlyOverviewTitle")}</CardTitle></CardHeader>
            <CardContent>
              {data.monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("ui.financePages.noPaidBookingsShort")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ui.financePages.month")}</TableHead>
                      <TableHead>{t("ui.financePages.currency")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.bookings")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.totalPriceAfterRefund")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.refund")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.platformFee")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.providerEarnings")}</TableHead>
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
            <CardHeader><CardTitle>{t("ui.financePages.payoutsTitle")}</CardTitle></CardHeader>
            <CardContent>
              {data.payouts.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("ui.financePages.noPayoutsYet")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ui.financePages.date")}</TableHead>
                      <TableHead>{t("ui.financePages.booking")}</TableHead>
                      <TableHead>{t("ui.financePages.reference")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.providerEarnings")}</TableHead>
                      <TableHead className="text-right">{t("ui.financePages.platformFee")}</TableHead>
                      <TableHead>{t("ui.financePages.currency")}</TableHead>
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
            <h2 className="text-lg font-serif mb-3">{t("ui.financePages.invoicesTitle")}</h2>
            <InvoicesPanel scope={scope} />
          </section>

          <p className="text-xs text-muted-foreground">
            {t("ui.financePages.footerNote")}
          </p>
        </>
      )}
    </div>
  );
}

export function ProviderFinance() {
  const { t } = useTranslation("finance");
  return (
    <RoleGuard allow={["provider", "admin"]}>
      <FinanceView scope="provider" title={t("ui.financePages.providerFinanceTitle")} />
    </RoleGuard>
  );
}

export function AdminFinance() {
  const { t } = useTranslation("finance");
  return (
    <RoleGuard allow={["admin"]}>
      <FinanceView scope="admin" title={t("ui.financePages.adminFinanceTitle")} />
    </RoleGuard>
  );
}
