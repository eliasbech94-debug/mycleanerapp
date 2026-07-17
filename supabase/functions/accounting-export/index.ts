// Xero-compatible CSV export for MyCleaner platform fee invoices.
// Admin/employee only. One CSV per currency to keep bookkeeping clean.
// Also exports a companion CSV of provider settlement statements for
// internal reconciliation (not imported into Xero as sales invoices).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const gate = requireRole(ctx, ["admin", "employee"], corsHeaders);
  if (gate) return gate;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "invoices"; // 'invoices' | 'statements'
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const country = url.searchParams.get("country");

  if (kind === "invoices") {
    let q = ctx.admin.from("platform_fee_invoices").select("*").order("issued_at");
    if (from) q = q.gte("issued_at", from);
    if (to) q = q.lte("issued_at", to);
    if (country) q = q.eq("platform_tax_snapshot->>country_code", country.toUpperCase());
    const { data, error } = await q;
    if (error) return csvError(error.message);

    // Xero "Sales Invoice" CSV columns
    const header = [
      "ContactName","EmailAddress","POAddressLine1","POCity","POCountry",
      "InvoiceNumber","InvoiceDate","DueDate","Description","Quantity","UnitAmount",
      "AccountCode","TaxType","TrackingName1","TrackingOption1","Currency",
    ];
    const rows = (data ?? []).map((inv) => {
      const p = (inv.provider_tax_snapshot ?? {}) as any;
      const t = (inv.platform_tax_snapshot ?? {}) as any;
      const bookingRef = (inv.metadata as any)?.booking_ref ?? inv.booking_id;
      const taxType = inv.vat_treatment === "reverse_charge" ? "Reverse Charge EU"
        : inv.vat_treatment === "outside_scope" ? "No VAT"
        : inv.vat_treatment === "exempt" ? "Zero Rated"
        : `Tax on Sales ${Number(inv.vat_rate).toFixed(0)}%`;
      return [
        p.business_name || p.full_name || "Provider",
        "",
        p.business_address ?? "",
        "",
        p.country_code ?? "",
        inv.invoice_number,
        inv.issued_at.slice(0, 10),
        inv.issued_at.slice(0, 10),
        `Platform fee 28% — booking ${bookingRef}`,
        "1",
        (inv.subtotal_amount / 100).toFixed(2),
        "200", // Sales
        taxType,
        "Country",
        t.country_code ?? "",
        inv.currency,
      ];
    });
    return csv([header, ...rows], `platform-fee-invoices-${from ?? "all"}.csv`);
  }

  if (kind === "statements") {
    let q = ctx.admin.from("provider_settlement_statements").select("*").order("issued_at");
    if (from) q = q.gte("issued_at", from);
    if (to) q = q.lte("issued_at", to);
    const { data, error } = await q;
    if (error) return csvError(error.message);

    const header = [
      "StatementNumber","IssuedAt","BookingId","BookingRef","ProviderUserId",
      "Currency","Gross","Refund","PlatformFee","ProviderNet","PayoutStatus",
      "TransferId","PayoutId","ServiceDate",
    ];
    const rows = (data ?? []).map((s) => [
      s.statement_number, s.issued_at, s.booking_id, (s.metadata as any)?.booking_ref ?? "",
      s.provider_user_id, s.currency,
      (s.gross_amount / 100).toFixed(2), (s.refund_amount / 100).toFixed(2),
      (s.platform_fee_amount / 100).toFixed(2), (s.provider_net_amount / 100).toFixed(2),
      s.payout_status, s.linked_transfer_id ?? "", s.linked_payout_id ?? "",
      s.service_date ?? "",
    ]);
    return csv([header, ...rows], `settlement-statements-${from ?? "all"}.csv`);
  }

  return csvError("unknown kind");
});

function csv(rows: (string | number)[][], filename: string): Response {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
function csvCell(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvError(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
