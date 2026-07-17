// Financial Marketplace — aggregated summary endpoint.
// Provider scope: only own data. Admin/employee scope: platform-wide.
// Never mutates payment / booking data.
//
// Multi-currency: all totals are grouped by currency. Never combine currencies
// into a single KPI. Refunds are subtracted from gross revenue and reduce both
// platform commission and provider net proportionally.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

interface CurrencyTotals {
  currency: string;
  gross_revenue: number;
  refunded_amount: number;
  platform_commission: number;
  provider_net: number;
  bookings_count: number;
  refunds_count: number;
}

interface MonthlyRow {
  month: string;
  currency: string;
  gross: number;
  refunded: number;
  fee: number;
  net: number;
  count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "provider";
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");

  const isAdmin = ctx.isSuperAdmin
    || ctx.roles.includes("admin")
    || ctx.roles.includes("employee");

  if (scope === "admin") {
    const forbidden = requireRole(ctx, ["admin", "employee"], corsHeaders);
    if (forbidden) return forbidden;
  }

  const { admin } = ctx;

  let bq = admin.from("bookings")
    .select("id, customer_pays, provider_gets, platform_fee_amount, refund_amount, currency, payment_status, status, booking_date, customer_user_id, provider_id, provider_name, created_at");
  if (fromDate) bq = bq.gte("booking_date", fromDate);
  if (toDate) bq = bq.lte("booking_date", toDate);
  if (scope !== "admin") {
    const { data: profile } = await admin.from("profiles")
      .select("provider_id").eq("id", ctx.user.id).maybeSingle();
    if (!profile?.provider_id) return json({ error: "Provider profile not found" }, 404);
    bq = bq.eq("provider_id", profile.provider_id);
  }
  const { data: bookings, error: bErr } = await bq;
  if (bErr) return json({ error: bErr.message }, 500);

  let pq = admin.from("finance_payouts")
    .select("id, booking_id, stripe_transfer_id, stripe_payout_id, stripe_charge_id, stripe_payment_intent_id, gross_amount, platform_fee_amount, net_amount, currency, status, arrival_date, created_at, provider_user_id, metadata");
  if (fromDate) pq = pq.gte("created_at", fromDate);
  if (toDate) pq = pq.lte("created_at", toDate);
  if (scope !== "admin") pq = pq.eq("provider_user_id", ctx.user.id);
  const { data: payouts } = await pq;

  const paid = (bookings ?? []).filter((b) =>
    b.payment_status === "captured" ||
    b.payment_status === "partially_refunded" ||
    b.payment_status === "refunded"
  );

  // ---- Per-currency aggregation with refund-adjusted numbers ----
  const byCurrency = new Map<string, CurrencyTotals>();
  const monthlyMap = new Map<string, MonthlyRow>();

  for (const b of paid) {
    const cur = (b.currency ?? "DKK").toUpperCase();
    const gross = b.customer_pays ?? 0;
    const refund = b.refund_amount ?? 0;
    // Proportional adjustment: refunded portion reduces commission + net pro-rata.
    const grossNet = Math.max(0, gross - refund);
    const commissionShare = gross > 0 ? (b.platform_fee_amount ?? 0) * (grossNet / gross) : 0;
    const providerShare = gross > 0 ? (b.provider_gets ?? 0) * (grossNet / gross) : 0;

    const row = byCurrency.get(cur) ?? {
      currency: cur, gross_revenue: 0, refunded_amount: 0,
      platform_commission: 0, provider_net: 0, bookings_count: 0, refunds_count: 0,
    };
    row.gross_revenue += grossNet;
    row.refunded_amount += refund;
    row.platform_commission += Math.round(commissionShare);
    row.provider_net += Math.round(providerShare);
    row.bookings_count += 1;
    if (refund > 0) row.refunds_count += 1;
    byCurrency.set(cur, row);

    const monthKey = `${(b.booking_date ?? b.created_at).slice(0, 7)}|${cur}`;
    const m = monthlyMap.get(monthKey) ?? {
      month: (b.booking_date ?? b.created_at).slice(0, 7),
      currency: cur, gross: 0, refunded: 0, fee: 0, net: 0, count: 0,
    };
    m.gross += grossNet;
    m.refunded += refund;
    m.fee += Math.round(commissionShare);
    m.net += Math.round(providerShare);
    m.count += 1;
    monthlyMap.set(monthKey, m);
  }

  // Payout totals per currency + status
  const payoutTotals = new Map<string, { currency: string; paid: number; in_transit: number; failed: number }>();
  for (const p of payouts ?? []) {
    const cur = (p.currency ?? "DKK").toUpperCase();
    const row = payoutTotals.get(cur) ?? { currency: cur, paid: 0, in_transit: 0, failed: 0 };
    if (p.status === "paid") row.paid += p.net_amount ?? 0;
    else if (p.status === "failed") row.failed += p.net_amount ?? 0;
    else row.in_transit += p.net_amount ?? 0;
    payoutTotals.set(cur, row);
  }

  const totalsByCurrency = [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const monthly = [...monthlyMap.values()].sort((a, b) =>
    a.currency === b.currency ? a.month.localeCompare(b.month) : a.currency.localeCompare(b.currency)
  );

  return json({
    scope,
    isAdmin,
    totals_by_currency: totalsByCurrency,
    payouts: {
      totals_by_currency: [...payoutTotals.values()],
      items: (payouts ?? []).slice(0, 200),
    },
    monthly,
    bookings: (bookings ?? []).slice(0, 200),
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
