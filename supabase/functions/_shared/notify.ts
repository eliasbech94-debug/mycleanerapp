// Multi-channel notification enqueue helper.
// Writes an in-app notification (customer_notifications) AND queues
// per-channel outbox rows (email/push) for downstream delivery workers.
// Fully idempotent via dedupe_key.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  formatDate,
  formatDateTime,
  formatMoneyMinor,
  type NotifyLang,
  renderNotification,
  resolveUserLang,
} from "./notifyI18n.ts";

export type NotifyChannel = "in_app" | "email" | "push";

/** Locale-sensitive variable values resolved at render time. */
export type NotifyVar =
  | string
  | number
  | null
  | undefined
  | { type: "money"; minor: number; currency: string }
  | { type: "date"; iso: string | null }
  | { type: "datetime"; iso: string | null };

export interface NotifyInput {
  user_id: string;
  event_type: string;                 // e.g. "booking.cancelled"
  dedupe_key: string;                 // stable per (user, event, target)
  subject: string;                    // fallback copy when no template exists
  body: string;                       // fallback copy when no template exists
  /** Catalogue key in notifyI18n templates. Defaults to event_type. */
  template_key?: string;
  /** Structured variables; preserved in payload so history stays reproducible. */
  vars?: Record<string, NotifyVar>;
  channels?: NotifyChannel[];         // default: all three
  action_label?: string;
  action_url?: string;
  related_booking_id?: string | null;
  payload?: Record<string, unknown>;
  severity?: "info" | "warning" | "error" | "success";
}

function resolveVars(
  vars: Record<string, NotifyVar> | undefined,
  lang: NotifyLang,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars ?? {})) {
    if (v && typeof v === "object") {
      if (v.type === "money") out[k] = formatMoneyMinor(v.minor, v.currency, lang);
      else if (v.type === "date") out[k] = formatDate(v.iso, lang);
      else if (v.type === "datetime") out[k] = formatDateTime(v.iso, lang);
    } else {
      out[k] = v ?? "";
    }
  }
  return out;
}

export async function notifyUser(
  admin: SupabaseClient,
  input: NotifyInput,
): Promise<{ in_app: boolean; queued: NotifyChannel[] }> {
  const channels = input.channels ?? ["in_app", "email", "push"];
  const result = { in_app: false, queued: [] as NotifyChannel[] };

  // Locale-aware copy: recipient profile language, English fallback.
  let lang: NotifyLang = "en";
  let subject = input.subject;
  let body = input.body;
  if (input.template_key || input.vars) {
    lang = await resolveUserLang(
      admin as unknown as Parameters<typeof resolveUserLang>[0],
      input.user_id,
    );
    const rendered = renderNotification(
      input.template_key ?? input.event_type,
      lang,
      resolveVars(input.vars, lang),
    );
    if (rendered) {
      subject = rendered.subject;
      body = rendered.body;
    }
  }

  const payload = {
    ...(input.payload ?? {}),
    ...(input.vars ? { vars: input.vars } : {}),
    template_key: input.template_key ?? input.event_type,
    lang,
  };


  if (channels.includes("in_app")) {
    try {
      // customer_notifications is the in-app inbox; dedupe on (user_id, dedupe_key)
      const { data: existing } = await admin
        .from("customer_notifications")
        .select("id")
        .eq("user_id", input.user_id)
        .eq("dedupe_key", input.dedupe_key)
        .maybeSingle();
      if (!existing) {
        await admin.from("customer_notifications").insert({
          user_id: input.user_id,
          kind: "update",
          severity: input.severity ?? "info",
          title: subject,
          body,

          action_label: input.action_label,
          action_url: input.action_url,
          related_booking_id: input.related_booking_id ?? null,
          dedupe_key: input.dedupe_key,
        });
      }
      result.in_app = true;
    } catch (e) {
      console.error("notify.in_app_failed", (e as Error).message);
    }
  }

  for (const ch of channels.filter((c) => c !== "in_app")) {
    try {
      await admin.from("notification_outbox").upsert({
        user_id: input.user_id,
        channel: ch,
        event_type: input.event_type,
        subject,
        body,
        payload,

        related_booking_id: input.related_booking_id ?? null,
        dedupe_key: input.dedupe_key,
        status: "pending",
      }, { onConflict: "user_id,channel,dedupe_key", ignoreDuplicates: true });
      result.queued.push(ch);
    } catch (e) {
      console.error(`notify.${ch}_enqueue_failed`, (e as Error).message);
    }
  }
  return result;
}
