// Daily monitor: deadline approaching + chargeback ratio thresholds.
// Callable by admin or cron (service-role).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireServiceOrAdmin } from "../_shared/auth.ts";
import { notifyUser } from "../_shared/notify.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Stripe risk threshold: ratio > 0.75% = warning, > 1% = risk
const RATIO_WARN = 0.0075;
const RATIO_CRIT = 0.01;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireServiceOrAdmin(req, corsHeaders);
  if (guard instanceof Response) return guard;

  const now = Date.now();
  const soon = new Date(now + 72 * 3600 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  // 1) Deadline approaching (<72h) and still open
  const { data: openDisputes } = await admin
    .from("stripe_disputes")
    .select("id, stripe_dispute_id, provider_user_id, booking_id, evidence_due_by, status")
    .lte("evidence_due_by", soon)
    .is("closed_at", null);

  let deadlineAlerts = 0;
  for (const d of openDisputes ?? []) {
    if (!d.evidence_due_by) continue;
    const hoursLeft = (new Date(d.evidence_due_by).getTime() - now) / 3600000;
    if (hoursLeft < 0) continue;
    await admin.from("dispute_alerts").upsert({
      dispute_id: d.id,
      code: "deadline_approaching",
      severity: hoursLeft < 24 ? "critical" : "warning",
      message: `Evidence-frist om ${Math.round(hoursLeft)} timer for indsigelse ${d.stripe_dispute_id}`,
      details: { hours_left: Math.round(hoursLeft), due_by: d.evidence_due_by },
    }, { onConflict: "dispute_id,code" });
    deadlineAlerts++;

    if (d.provider_user_id) {
      await notifyUser(admin, {
        user_id: d.provider_user_id,
        event_type: "dispute.evidence_required",
        dedupe_key: `dispute:${d.stripe_dispute_id}:deadline:${hoursLeft < 24 ? "24h" : "72h"}`,
        subject: hoursLeft < 24 ? "Kritisk: dokumentation mangler (<24t)" : "Dokumentation kræves inden 72 timer",
        body: `Du skal indsende dokumentation til indsigelse ${d.stripe_dispute_id} inden ${new Date(d.evidence_due_by).toLocaleString("da-DK")}.`,
        severity: hoursLeft < 24 ? "error" : "warning",
        action_label: "Uploade dokumentation",
        action_url: `/provider/disputes/${d.id}`,
        related_booking_id: d.booking_id,
      });
    }
  }

  // 2) Chargeback ratio last 30 days (platform + per provider)
  const { count: totalCharges } = await admin.from("bookings")
    .select("id", { count: "exact", head: true })
    .in("payment_status", ["captured", "refunded", "partially_refunded"])
    .gte("created_at", monthAgo);

  const { count: totalDisputes } = await admin.from("stripe_disputes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthAgo);

  const ratio = totalCharges && totalCharges > 0 ? (totalDisputes ?? 0) / totalCharges : 0;
  if (ratio >= RATIO_WARN) {
    await admin.from("dispute_alerts").upsert({
      dispute_id: null,
      code: "chargeback_ratio_exceeded",
      severity: ratio >= RATIO_CRIT ? "critical" : "warning",
      message: `Platform chargeback ratio 30d: ${(ratio * 100).toFixed(2)}%`,
      details: { ratio, total_charges: totalCharges, total_disputes: totalDisputes },
    }, { onConflict: "dispute_id,code" });
  }

  return new Response(JSON.stringify({
    ok: true,
    deadline_alerts: deadlineAlerts,
    platform_ratio: ratio,
    total_disputes: totalDisputes,
    total_charges: totalCharges,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
