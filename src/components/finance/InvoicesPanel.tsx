import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/finance";
import { fetchInvoicesList, fetchInvoiceDownloadUrl, type PlatformFeeInvoice, type SettlementStatement } from "@/lib/invoices";
import { supabase } from "@/integrations/supabase/client";

function TreatmentBadge({ t }: { t: PlatformFeeInvoice["vat_treatment"] }) {
  const label = t === "reverse_charge" ? "Reverse charge"
    : t === "outside_scope" ? "Uden for scope"
    : t === "exempt" ? "Momsfri" : "Standard";
  return <Badge variant="outline">{label}</Badge>;
}

async function download(kind: "invoice" | "statement", id: string) {
  try {
    const url = await fetchInvoiceDownloadUrl(kind, id);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e: any) {
    toast.error(e.message ?? "Kunne ikke hente PDF");
  }
}

export function InvoicesPanel({ scope }: { scope: "provider" | "admin" }) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<PlatformFeeInvoice[]>([]);
  const [statements, setStatements] = useState<SettlementStatement[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchInvoicesList(scope);
        if (cancelled) return;
        setInvoices(res.invoices);
        setStatements(res.statements);
      } catch (e: any) {
        toast.error(e.message ?? "Kunne ikke hente fakturaer");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scope]);

  async function exportCsv(kind: "invoices" | "statements") {
    setExporting(kind);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${projectUrl}/functions/v1/accounting-export?kind=${kind}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast.error(e.message ?? "Eksport fejlede");
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Indlæser fakturaer…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Platform Fee Invoices</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              MyCleaner opkræver 28% marketplace-kommission af udbyderen. Momsbehandling afhænger af udbyderens skatteoplysninger.
            </p>
          </div>
          {scope === "admin" && (
            <Button size="sm" variant="outline" onClick={() => exportCsv("invoices")} disabled={exporting !== null}>
              <Download className="h-4 w-4 mr-1" />
              {exporting === "invoices" ? "Eksporterer…" : "Xero CSV"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen fakturaer endnu.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Udstedt</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead className="text-right">Gebyr</TableHead>
                  <TableHead className="text-right">Moms</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Behandling</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{formatDate(inv.issued_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.booking_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{formatMoney(inv.subtotal_amount, inv.currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(inv.vat_amount, inv.currency)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(inv.total_amount, inv.currency)}</TableCell>
                    <TableCell><TreatmentBadge t={inv.vat_treatment} /></TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => download("invoice", inv.id)}>
                        <FileText className="h-4 w-4 mr-1" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Provider Settlement Statements</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Finansiel afregningsoversigt pr. booking. <strong>Ikke</strong> en momsfaktura fra MyCleaner —
              udbyderen er selv ansvarlig for eventuel kundefakturering og momsafregning.
            </p>
          </div>
          {scope === "admin" && (
            <Button size="sm" variant="outline" onClick={() => exportCsv("statements")} disabled={exporting !== null}>
              <Download className="h-4 w-4 mr-1" />
              {exporting === "statements" ? "Eksporterer…" : "CSV"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {statements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen afregningsoversigter endnu.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Udstedt</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead className="text-right">Platformgebyr</TableHead>
                  <TableHead className="text-right">Netto til udbyder</TableHead>
                  <TableHead>Payout</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.statement_number}</TableCell>
                    <TableCell>{formatDate(s.issued_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{s.booking_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{formatMoney(s.gross_amount, s.currency)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatMoney(s.refund_amount, s.currency)}</TableCell>
                    <TableCell className="text-right">- {formatMoney(s.platform_fee_amount, s.currency)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(s.provider_net_amount, s.currency)}</TableCell>
                    <TableCell><Badge variant="secondary">{s.payout_status}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => download("statement", s.id)}>
                        <FileText className="h-4 w-4 mr-1" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
