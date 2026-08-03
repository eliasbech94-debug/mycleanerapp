// Mission Control aggregation endpoint.
// READ-ONLY. Reuses existing tables only — no business logic lives here.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

const DAY = 24 * 3600e3;

function startOfDayUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface BookingRow {
  id: string;
  created_at: string;
  booking_date: string | null;
  status: string;
  payment_status: string;
  customer_pays: number | null;
  platform_fee_amount: number | null;
  currency: string | null;
  country_code: string | null;
  service: string | null;
  provider_name: string | null;
}

const EARNING_PAYMENT_STATES = new Set(["authorized", "captured", "partially_refunded"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const admin = ctx.admin;
  const now = new Date();
  const today = startOfDayUTC(now);
  const since24h = new Date(now.getTime() - DAY).toISOString();
  const since7d = new Date(now.getTime() - 7 * DAY).toISOString();
  const since30d = new Date(now.getTime() - 30 * DAY).toISOString();
  const since90d = new Date(now.getTime() - 90 * DAY).toISOString();
  const weekStart = new Date(today.getTime() - 6 * DAY);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    bookingsRes,
    pendingBookings,
    activeBookings,
    customersRes,
    providersRes,
    newProfiles7d,
    pendingReview,
    pendingIdentity,
    insuranceMissing,
    openConversations,
    refundOpen,
    webhooks24,
    emails24,
    smsFailed24,
    outboxBacklog,
    alerts,
    errors24,
    lifecycle,
    profileGrowth,
    providerGrowth,
  ] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, created_at, booking_date, status, payment_status, customer_pays, platform_fee_amount, currency, country_code, service, provider_name",
      )
      .gte("created_at", since90d)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "accepted"),
    admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "customer"),
    admin.from("provider_profiles").select("user_id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7d),
    admin.from("provider_profiles").select("user_id", { count: "exact", head: true }).eq("status", "pending_review"),
    admin.from("provider_profiles").select("user_id", { count: "exact", head: true }).eq("status", "pending_identity"),
    admin
      .from("provider_profiles")
      .select("user_id", { count: "exact", head: true })
      .in("status", ["pending_review", "active"])
      .is("insurance_expires_on", null),
    admin.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("refund_requests_v2").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("webhook_metrics").select("result").gte("received_at", since24h).limit(2000),
    admin.from("email_send_log").select("status").gte("created_at", since24h).limit(2000),
    admin
      .from("notification_outbox")
      .select("id", { count: "exact", head: true })
      .eq("channel", "sms")
      .eq("status", "failed")
      .gte("created_at", since24h),
    admin.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("system_alerts")
      .select("id, title, severity, source, status, last_seen_at")
      .neq("status", "resolved")
      .order("last_seen_at", { ascending: false })
      .limit(10),
    admin.from("error_events").select("level").gte("occurred_at", since24h).limit(2000),
    admin
      .from("booking_lifecycle_events")
      .select("id, booking_id, from_state, to_state, actor_role, created_at, reason")
      .order("created_at", { ascending: false })
      .limit(25),
    admin.from("profiles").select("created_at").gte("created_at", since30d).limit(5000),
    admin.from("provider_profiles").select("created_at").gte("created_at", since30d).limit(5000),
  ]);

  const bookings = (bookingsRes.data ?? []) as BookingRow[];

  // Dominant currency across the sampled window — Mission Control shows one
  // headline currency and lists the rest separately.
  const currencyCount = new Map<string, number>();
  for (const b of bookings) {
    const c = (b.currency ?? "").toUpperCase();
    if (!c) continue;
    currencyCount.set(c, (currencyCount.get(c) ?? 0) + 1);
  }
  const primaryCurrency =
    [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const earning = (b: BookingRow) =>
    b.status !== "cancelled" &&
    b.status !== "declined" &&
    EARNING_PAYMENT_STATES.has(b.payment_status);

  function revenueSince(fromISO: string) {
    let gross = 0;
    let fee = 0;
    let count = 0;
    for (const b of bookings) {
      if (b.created_at < fromISO) continue;
      if (primaryCurrency && (b.currency ?? "").toUpperCase() !== primaryCurrency) continue;
      if (!earning(b)) continue;
      gross += Number(b.customer_pays ?? 0);
      fee += Number(b.platform_fee_amount ?? 0);
      count += 1;
    }
    return { gross_minor: gross, fee_minor: fee, count };
  }

  const todayISO = today.toISOString();
  const bookingsToday = bookings.filter((b) => b.created_at >= todayISO).length;
  const completed30d = bookings.filter((b) => b.created_at >= since30d && b.status === "completed").length;
  const cancelled30d = bookings.filter((b) => b.created_at >= since30d && b.status === "cancelled").length;
  const created30d = bookings.filter((b) => b.created_at >= since30d).length;

  // Daily revenue + booking series (last 30 days, primary currency).
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    days.push(new Date(today.getTime() - i * DAY).toISOString().slice(0, 10));
  }
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const series = days.map((date) => ({ date, gross_minor: 0, fee_minor: 0, bookings: 0 }));
  for (const b of bookings) {
    const key = b.created_at.slice(0, 10);
    const idx = dayIndex.get(key);
    if (idx === undefined) continue;
    series[idx].bookings += 1;
    if (primaryCurrency && (b.currency ?? "").toUpperCase() !== primaryCurrency) continue;
    if (!earning(b)) continue;
    series[idx].gross_minor += Number(b.customer_pays ?? 0);
    series[idx].fee_minor += Number(b.platform_fee_amount ?? 0);
  }

  // Country mix (last 30 days).
  const countryMap = new Map<string, { bookings: number; gross_minor: number }>();
  for (const b of bookings) {
    if (b.created_at < since30d) continue;
    const code = (b.country_code ?? "").toUpperCase();
    if (!code) continue;
    const row = countryMap.get(code) ?? { bookings: 0, gross_minor: 0 };
    row.bookings += 1;
    if (earning(b)) row.gross_minor += Number(b.customer_pays ?? 0);
    countryMap.set(code, row);
  }
  const countries = [...countryMap.entries()]
    .map(([country_code, v]) => ({ country_code, ...v }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 8);

  // Cumulative growth series.
  function growthSeries(rows: Array<{ created_at: string }>) {
    const buckets = new Map(days.map((d) => [d, 0]));
    for (const r of rows) {
      const key = r.created_at.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let running = 0;
    return days.map((date) => {
      running += buckets.get(date) ?? 0;
      return { date, added: buckets.get(date) ?? 0, cumulative: running };
    });
  }

  const webhookRows = webhooks24.data ?? [];
  const failedWebhooks = webhookRows.filter((w) => w.result !== "success" && w.result !== "ok").length;
  const emailRows = emails24.data ?? [];
  const failedEmails = emailRows.filter((e) => e.status !== "sent" && e.status !== "delivered").length;
  const errorRows = errors24.data ?? [];
  const errorCount = errorRows.filter((e) => e.level === "error" || e.level === "fatal").length;

  return json({
    generated_at: now.toISOString(),
    currency: primaryCurrency,
    currencies: [...currencyCount.keys()],
    revenue: {
      today: revenueSince(todayISO),
      week: revenueSince(weekStart.toISOString()),
      month: revenueSince(monthStart.toISOString()),
    },
    bookings: {
      today: bookingsToday,
      pending: pendingBookings.count ?? 0,
      active: activeBookings.count ?? 0,
      completed_30d: completed30d,
      cancelled_30d: cancelled30d,
      created_30d: created30d,
      completion_rate: created30d > 0 ? completed30d / created30d : null,
      cancellation_rate: created30d > 0 ? cancelled30d / created30d : null,
    },
    people: {
      customers: customersRes.count ?? 0,
      providers_active: providersRes.count ?? 0,
      new_signups_7d: newProfiles7d.count ?? 0,
      pending_review: pendingReview.count ?? 0,
      pending_identity: pendingIdentity.count ?? 0,
      insurance_missing: insuranceMissing.count ?? 0,
    },
    support: {
      open_conversations: openConversations.count ?? 0,
      open_refund_requests: refundOpen.count ?? 0,
    },
    health: {
      webhooks_24h: webhookRows.length,
      webhooks_failed_24h: failedWebhooks,
      emails_24h: emailRows.length,
      emails_failed_24h: failedEmails,
      sms_failed_24h: smsFailed24.count ?? 0,
      notification_backlog: outboxBacklog.count ?? 0,
      errors_24h: errorCount,
      open_alerts: (alerts.data ?? []).length,
    },
    alerts: alerts.data ?? [],
    series: {
      daily: series,
      countries,
      customer_growth: growthSeries((profileGrowth.data ?? []) as Array<{ created_at: string }>),
      provider_growth: growthSeries((providerGrowth.data ?? []) as Array<{ created_at: string }>),
    },
    activity: lifecycle.data ?? [],
  });
});
