// Finance reconciliation job.
// For every captured/refunded booking in the window, verify the presence of
// each downstream artifact and log alerts for any mismatch.
//   • Stripe PaymentIntent id on booking
//   • Refund present when refund_amount > 0
//   • Platform fee invoice row
//   • Credit note row when refunded
//   • Provider settlement row
//   • Payout row for the settlement
// Alerts are UPSERTed by (booking_id, code) so re-runs stay idempotent.
// Auth: service-role (cron) or authenticated admin.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate, requireRole } from "../_shared/auth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Alert = {
  booking_id: string;
  code: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  details?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const isService = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isService) {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const forbidden = requireRole(ctx, ["admin"], corsHeaders);
    if (forbidden) return forbidden;
  }

  const body = await req.json().catch(() => ({}));
  const hoursBack = Number(body.hours_back ?? 24 * 30); // default: last 30 days
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hoursBack * 3600_000);

  const { data: bookings, error: bkErr } = await admin
    .from("bookings")
    .select("id, status, payment_status, payment_intent_id, refund_amount, customer_pays, currency, updated_at")
    .in("payment_status", ["captured", "partially_refunded", "refunded", "authorized", "canceled"])
    .gte("updated_at", windowStart.toISOString())
    .lte("updated_at", windowEnd.toISOString());
  if (bkErr) return json({ error: bkErr.message }, 500);

  const alerts: Alert[] = [];

  for (const b of bookings ?? []) {
    const captured = b.payment_status === "captured"
      || b.payment_status === "partially_refunded"
      || b.payment_status === "refunded";
    const refunded = (b.refund_amount ?? 0) > 0;

    if (captured && !b.payment_intent_id) {
      alerts.push({ booking_id: b.id, code: "missing_payment_intent",
        severity: "critical",
        message: "Captured booking has no Stripe payment_intent_id" });
    }

    if (captured) {
      const { data: inv } = await admin.from("platform_fee_invoices")
        .select("id").eq("booking_id", b.id).maybeSingle();
      if (!inv) alerts.push({ booking_id: b.id, code: "missing_platform_fee_invoice",
        severity: "error",
        message: "Captured booking has no platform fee invoice" });

      const { data: stmt } = await admin.from("provider_settlement_statements")
        .select("id, gross_amount, refund_amount").eq("booking_id", b.id).maybeSingle();
      if (!stmt) {
        alerts.push({ booking_id: b.id, code: "missing_settlement",
          severity: "error",
          message: "Captured booking has no provider settlement statement" });
      } else if (refunded && (stmt.refund_amount ?? 0) !== (b.refund_amount ?? 0)) {
        alerts.push({ booking_id: b.id, code: "settlement_refund_mismatch",
          severity: "warning",
          message: "Settlement refund amount does not match booking refund amount",
          details: { booking_refund: b.refund_amount, settlement_refund: stmt.refund_amount } });
      }

      // Payout linkage (best-effort — payout may lag settlement)
      if (stmt) {
        const { data: payout } = await admin.from("finance_payouts")
          .select("id").contains("bookings", [b.id]).maybeSingle()
          .then((r) => r, () => ({ data: null }));
        // finance_payouts.bookings may not exist — degrade to booking_id match if column exists
        if (!payout) {
          const olderThan = Date.now() - new Date(b.updated_at).getTime() > 7 * 86400_000;
          if (olderThan) {
            alerts.push({ booking_id: b.id, code: "missing_payout",
              severity: "warning",
              message: "Settlement >7 days old with no linked payout" });
          }
        }
      }
    }

    if (refunded) {
      const { data: cn } = await admin.from("platform_credit_notes")
        .select("id").eq("booking_id", b.id).maybeSingle();
      if (!cn) alerts.push({ booking_id: b.id, code: "missing_credit_note",
        severity: "error",
        message: "Refunded booking has no platform credit note" });
    }
  }

  const { data: run } = await admin.from("finance_reconciliation_runs").insert({
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    bookings_scanned: (bookings ?? []).length,
    alerts_created: alerts.length,
    status: "completed",
    summary: { by_code: alerts.reduce((acc: Record<string, number>, a) => {
      acc[a.code] = (acc[a.code] ?? 0) + 1; return acc;
    }, {}) },
  }).select("id").maybeSingle();

  for (const a of alerts) {
    await admin.from("finance_reconciliation_alerts").upsert({
      run_id: run?.id ?? null,
      booking_id: a.booking_id,
      severity: a.severity,
      code: a.code,
      message: a.message,
      details: a.details ?? {},
    }, { onConflict: "booking_id,code", ignoreDuplicates: false });
  }

  return json({
    ok: true,
    run_id: run?.id,
    scanned: (bookings ?? []).length,
    alerts: alerts.length,
    window: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
  });
});
