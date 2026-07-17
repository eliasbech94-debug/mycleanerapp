// Financial Marketplace — aggregated summary endpoint.
// Provider scope: only own data. Admin/employee scope: platform-wide.
// Never mutates payment / booking data.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "provider"; // "provider" | "admin"
  const fromDate = url.searchParams.get("from"); // ISO date
  const toDate = url.searchParams.get("to");

  const isAdmin = ctx.isSuperAdmin
    || ctx.roles.includes("admin")
    || ctx.roles.includes("employee");

  if (scope === "admin") {
    const forbidden = requireRole(ctx, ["admin", "employee"], corsHeaders);
    if (forbidden) return forbidden;
  }

  const { admin } = ctx;

  // --- Bookings query (source of truth for revenue) ---
  let bq = admin.from("bookings")
    .select("id, customer_pays, provider_gets, platform_fee_amount, currency, payment_status, status, booking_date, customer_user_id, provider_id, provider_name, created_at");
  if (fromDate) bq = bq.gte("booking_date", fromDate);
  if (toDate) bq = bq.lte("booking_date", toDate);
  if (scope !== "admin") {
    // Provider view — filter by provider's own provider_id via profile lookup
    const { data: profile } = await admin.from("profiles")
      .select("provider_id").eq("id", ctx.user.id).maybeSingle();
    if (!profile?.provider_id) {
      return json({ error: "Provider profile not found" }, 404);
    }
    bq = bq.eq("provider_id", profile.provider_id);
  }
  const { data: bookings, error: bErr } = await bq;
  if (bErr) return json({ error: bErr.message }, 500);

  // --- Payouts (Stripe transfers/payouts mirror) ---
  let pq = admin.from("finance_payouts")
    .select("id, booking_id, stripe_transfer_id, stripe_payout_id, gross_amount, platform_fee_amount, net_amount, currency, status, arrival_date, created_at, provider_user_id");
  if (fromDate) pq = pq.gte("created_at", fromDate);
  if (toDate) pq = pq.lte("created_at", toDate);
  if (scope !== "admin") pq = pq.eq("provider_user_id", ctx.user.id);
  const { data: payouts } = await pq;

  // --- Aggregate ---
  const paid = (bookings ?? []).filter((b) =>
    b.payment_status === "captured" || b.payment_status === "partially_refunded"
  );
  const totalRevenue = paid.reduce((s, b) => s + (b.customer_pays ?? 0), 0);
  const totalPlatformFee = paid.reduce((s, b) => s + (b.platform_fee_amount ?? 0), 0);
  const totalProviderNet = paid.reduce((s, b) => s + (b.provider_gets ?? 0), 0);
  const currency = paid[0]?.currency ?? "DKK";

  // Group by month
  const byMonth = new Map<string, { gross: number; fee: number; net: number; count: number }>();
  for (const b of paid) {
    const m = (b.booking_date ?? b.created_at).slice(0, 7);
    const row = byMonth.get(m) ?? { gross: 0, fee: 0, net: 0, count: 0 };
    row.gross += b.customer_pays ?? 0;
    row.fee += b.platform_fee_amount ?? 0;
    row.net += b.provider_gets ?? 0;
    row.count += 1;
    byMonth.set(m, row);
  }
  const monthly = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, r]) => ({ month, ...r }));

  const payoutTotals = {
    paid: (payouts ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + (p.net_amount ?? 0), 0),
    in_transit: (payouts ?? []).filter((p) => p.status === "in_transit" || p.status === "pending").reduce((s, p) => s + (p.net_amount ?? 0), 0),
    failed: (payouts ?? []).filter((p) => p.status === "failed").reduce((s, p) => s + (p.net_amount ?? 0), 0),
  };

  return json({
    scope,
    isAdmin,
    currency,
    totals: {
      gross_revenue: totalRevenue,
      platform_commission: totalPlatformFee,
      provider_net: totalProviderNet,
      bookings_count: paid.length,
    },
    payouts: {
      totals: payoutTotals,
      items: (payouts ?? []).slice(0, 100),
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
