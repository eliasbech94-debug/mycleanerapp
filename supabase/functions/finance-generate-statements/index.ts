// Generates monthly finance_statements per provider per currency.
// Callable by admins or by pg_cron (service-role). Never mutates bookings.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireServiceOrAdmin } from "../_shared/auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireServiceOrAdmin(req, corsHeaders);
  if (gate instanceof Response) return gate;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month"); // YYYY-MM (defaults to previous month)
  const now = new Date();
  const target = monthParam
    ? new Date(`${monthParam}-01T00:00:00Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1));
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1));
  const startIso = start.toISOString().slice(0, 10);
  const endIso = new Date(end.getTime() - 86400000).toISOString().slice(0, 10);

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("provider_id, customer_pays, provider_gets, platform_fee_amount, refund_amount, currency, payment_status, booking_date")
    .gte("booking_date", startIso)
    .lte("booking_date", endIso)
    .in("payment_status", ["captured", "partially_refunded", "refunded"]);
  if (error) return json({ error: error.message }, 500);

  // Map provider_id → provider_user_id
  const providerIds = [...new Set((bookings ?? []).map((b) => b.provider_id).filter(Boolean))];
  const { data: profs } = await admin
    .from("profiles").select("id, provider_id").in("provider_id", providerIds);
  const idMap = new Map((profs ?? []).map((p) => [p.provider_id, p.id]));

  type Key = string;
  const agg = new Map<Key, {
    provider_user_id: string; currency: string;
    gross: number; fee: number; net: number; refunded: number; count: number;
  }>();

  for (const b of bookings ?? []) {
    const puid = idMap.get(b.provider_id);
    if (!puid) continue;
    const cur = (b.currency ?? "DKK").toUpperCase();
    const key = `${puid}|${cur}`;
    const gross = b.customer_pays ?? 0;
    const refund = b.refund_amount ?? 0;
    const grossNet = Math.max(0, gross - refund);
    const feeShare = gross > 0 ? Math.round((b.platform_fee_amount ?? 0) * (grossNet / gross)) : 0;
    const netShare = gross > 0 ? Math.round((b.provider_gets ?? 0) * (grossNet / gross)) : 0;

    const row = agg.get(key) ?? {
      provider_user_id: puid, currency: cur,
      gross: 0, fee: 0, net: 0, refunded: 0, count: 0,
    };
    row.gross += grossNet;
    row.refunded += refund;
    row.fee += feeShare;
    row.net += netShare;
    row.count += 1;
    agg.set(key, row);
  }

  // Count payouts too (per provider per currency in the period)
  const { data: payouts } = await admin.from("finance_payouts")
    .select("provider_user_id, currency, status")
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
  const payoutCount = new Map<string, number>();
  for (const p of payouts ?? []) {
    const k = `${p.provider_user_id}|${(p.currency ?? "DKK").toUpperCase()}`;
    payoutCount.set(k, (payoutCount.get(k) ?? 0) + 1);
  }

  const rows = [...agg.entries()].map(([k, r]) => ({
    provider_user_id: r.provider_user_id,
    period_start: startIso,
    period_end: endIso,
    currency: r.currency,
    gross_total: r.gross,
    platform_fee_total: r.fee,
    net_total: r.net,
    bookings_count: r.count,
    payouts_count: payoutCount.get(k) ?? 0,
    status: "final",
    metadata: { refunded_total: r.refunded, generated_by: "finance-generate-statements" },
    generated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upErr } = await admin.from("finance_statements")
      .upsert(rows, { onConflict: "provider_user_id,period_start,period_end,currency" });
    if (upErr) return json({ error: upErr.message }, 500);
  }

  return json({
    ok: true,
    period: { start: startIso, end: endIso },
    statements_generated: rows.length,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
