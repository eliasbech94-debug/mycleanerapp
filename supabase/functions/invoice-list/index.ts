// Lists platform-fee invoices and provider settlement statements.
// Provider scope: own only. Admin scope: all, with optional filters.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "provider";
  const country = url.searchParams.get("country");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const isAdmin = ctx.isSuperAdmin || ctx.roles.includes("admin") || ctx.roles.includes("employee");

  if (scope === "admin") {
    const forbidden = requireRole(ctx, ["admin", "employee"], corsHeaders);
    if (forbidden) return forbidden;
  }

  let iq = ctx.admin.from("platform_fee_invoices")
    .select("id, invoice_number, booking_id, provider_user_id, currency, subtotal_amount, vat_rate, vat_amount, total_amount, vat_treatment, status, issued_at, pdf_storage_path, platform_tax_snapshot, provider_tax_snapshot")
    .order("issued_at", { ascending: false }).limit(200);
  let sq = ctx.admin.from("provider_settlement_statements")
    .select("id, statement_number, booking_id, provider_user_id, currency, gross_amount, refund_amount, platform_fee_amount, provider_net_amount, payout_status, issued_at, pdf_storage_path, service_date, customer_display_name")
    .order("issued_at", { ascending: false }).limit(200);

  if (scope !== "admin") {
    iq = iq.eq("provider_user_id", ctx.user.id);
    sq = sq.eq("provider_user_id", ctx.user.id);
  }
  if (from) { iq = iq.gte("issued_at", from); sq = sq.gte("issued_at", from); }
  if (to) { iq = iq.lte("issued_at", to); sq = sq.lte("issued_at", to); }
  if (country && scope === "admin") {
    iq = iq.eq("platform_tax_snapshot->>country_code", country.toUpperCase());
  }

  const [{ data: invoices, error: iErr }, { data: statements, error: sErr }] = await Promise.all([iq, sq]);
  if (iErr) return json({ error: iErr.message }, 500);
  if (sErr) return json({ error: sErr.message }, 500);

  return json({ scope, isAdmin, invoices: invoices ?? [], statements: statements ?? [] });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
