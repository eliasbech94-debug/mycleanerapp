import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expected = Deno.env.get("RCS_WEBHOOK_SECRET");
  if (expected && request.headers.get("x-webhook-secret") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const event = await request.json();
  const messageId = event?.deliveryReceipt?.messageId || event?.readReceipt?.messageId || event?.messageId;
  if (!messageId) return Response.json({ ignored: true });

  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (event.deliveryReceipt) {
    values.status = "delivered";
    values.delivered_at = new Date().toISOString();
  }
  if (event.readReceipt) {
    values.status = "read";
    values.read_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("notification_outbox")
    .update(values)
    .eq("rcs_message_id", messageId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
});
