// Multi-channel notification enqueue helper.
// Writes an in-app notification (customer_notifications) AND queues
// per-channel outbox rows (email/push) for downstream delivery workers.
// Fully idempotent via dedupe_key.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type NotifyChannel = "in_app" | "email" | "push";

export interface NotifyInput {
  user_id: string;
  event_type: string;                 // e.g. "booking.cancelled"
  dedupe_key: string;                 // stable per (user, event, target)
  subject: string;
  body: string;
  channels?: NotifyChannel[];         // default: all three
  action_label?: string;
  action_url?: string;
  related_booking_id?: string | null;
  payload?: Record<string, unknown>;
  severity?: "info" | "warning" | "error" | "success";
}

export async function notifyUser(
  admin: SupabaseClient,
  input: NotifyInput,
): Promise<{ in_app: boolean; queued: NotifyChannel[] }> {
  const channels = input.channels ?? ["in_app", "email", "push"];
  const result = { in_app: false, queued: [] as NotifyChannel[] };

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
          title: input.subject,
          body: input.body,
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
        subject: input.subject,
        body: input.body,
        payload: input.payload ?? {},
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
