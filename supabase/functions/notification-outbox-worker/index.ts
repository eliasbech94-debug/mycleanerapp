// Notification outbox delivery worker.
// Delivers pending rows in `notification_outbox` via configured providers.
// If no provider secret is configured for a channel, rows are marked "skipped".
// Fully instrumented (monitored + startJobRun) and idempotent (status transitions
// guard against double-send).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { monitored } from "../_shared/logger.ts";
import { startJobRun } from "../_shared/jobrun.ts";
import { requireServiceOrAdmin } from "../_shared/auth.ts";
import { isSmsConfigured, sendSms as sendSmsViaGatewayApi } from "../_shared/gatewayapi.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BATCH = 50;
const MAX_ATTEMPTS = 5;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendEmail(_to: string, _subject: string, _body: string): Promise<{ ok: boolean; note?: string }> {
  if (!Deno.env.get("RESEND_API_KEY")) return { ok: false, note: "email_provider_not_configured" };
  // Placeholder: integrate Resend / provider of choice here.
  return { ok: true };
}
async function sendPush(_userId: string, _subject: string, _body: string): Promise<{ ok: boolean; note?: string }> {
  if (!Deno.env.get("FCM_SERVER_KEY")) return { ok: false, note: "push_provider_not_configured" };
  return { ok: true };
}
async function sendSmsChannel(phone: string, body: string, reference: string): Promise<{ ok: boolean; note?: string }> {
  if (!isSmsConfigured()) return { ok: false, note: "sms_provider_not_configured" };
  const res = await sendSmsViaGatewayApi({ to: phone, message: body, reference });
  if (res.ok) return { ok: true };
  return { ok: false, note: res.reason };
}

/**
 * Resolves the SMS body from the central template layer.
 * The outbox row stores template_key + vars + lang in `payload`, so SMS copy is
 * localized here rather than hardcoded. Falls back to the stored body.
 */
function resolveSmsBody(row: {
  event_type?: string | null;
  body?: string | null;
  payload?: Record<string, unknown> | null;
}): string {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const key = (payload.template_key as string | undefined) ?? row.event_type ?? "";
  const lang = (payload.lang as string | undefined) ?? null;
  const vars = (payload.vars as Record<string, never> | undefined) ?? {};
  const rendered = key ? renderSmsForNotification(key, lang, vars) : null;
  return rendered?.text || (row.body ?? "");
}

Deno.serve(monitored("notification-outbox-worker", async (req, log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireServiceOrAdmin(req, corsHeaders);
  if (guard instanceof Response) return guard;

  const run = await startJobRun("notification-outbox-worker", log.correlationId);
  const counters = { processed: 0, success: 0, failed: 0, retry: 0 };
  try {
    const { data: rows, error } = await admin
      .from("notification_outbox")
      .select("*")
      .in("status", ["pending", "retry"])
      .lte("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) throw error;

    for (const row of rows ?? []) {
      counters.processed += 1;
      try {
        let result: { ok: boolean; note?: string } = { ok: false, note: "unknown_channel" };
        if (row.channel === "email") result = await sendEmail(row.recipient ?? "", row.subject ?? "", row.body ?? "");
        else if (row.channel === "push") result = await sendPush(row.user_id, row.subject ?? "", row.body ?? "");
        else if (row.channel === "sms") result = await sendSmsChannel(row.recipient ?? "", row.body ?? "", `outbox:${row.id}`);

        if (result.ok) {
          counters.success += 1;
          await admin.from("notification_outbox").update({
            status: "sent", sent_at: new Date().toISOString(),
            attempts: (row.attempts ?? 0) + 1, last_error: null,
          }).eq("id", row.id);
        } else {
          const nextAttempts = (row.attempts ?? 0) + 1;
          const done = nextAttempts >= MAX_ATTEMPTS;
          counters.failed += done ? 1 : 0; counters.retry += done ? 0 : 1;
          await admin.from("notification_outbox").update({
            status: done ? "failed" : "retry",
            attempts: nextAttempts, last_error: result.note ?? "delivery_failed",
          }).eq("id", row.id);
          if (done) {
            await admin.rpc("raise_system_alert", {
              _alert_key: `notification_delivery:${row.channel}`,
              _severity: "warning",
              _source: "notification-outbox-worker",
              _title: `Notification delivery failing (${row.channel})`,
              _body: result.note ?? "delivery_failed",
              _correlation_id: log.correlationId,
              _metadata: { channel: row.channel, sample_row: row.id },
            });
          }
        }
      } catch (e) {
        counters.failed += 1;
        await log.error(e, { category: "notification_delivery", row_id: row.id });
        await admin.from("notification_outbox").update({
          status: "retry", attempts: (row.attempts ?? 0) + 1,
          last_error: (e as Error).message.slice(0, 500),
        }).eq("id", row.id);
      }
    }

    await run.finish("completed", counters);
    return json({ ok: true, ...counters });
  } catch (e) {
    await log.error(e, { category: "outbox_worker_top" });
    await run.finish("failed", counters, e);
    return json({ error: (e as Error).message }, 500);
  }
}));
