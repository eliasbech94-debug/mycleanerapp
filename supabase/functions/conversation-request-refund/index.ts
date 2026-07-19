import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  booking_id: z.string().uuid().optional().nullable(),
  requested_amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  reason: z.string().min(3).max(1000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "support_only" }, corsHeaders);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, booking_id, requested_amount, currency, reason } = parsed.data;
    const { admin, user } = ctx;
    const { data: rr, error } = await admin.from("refund_requests_v2").insert({
      conversation_id, booking_id: booking_id ?? null, requested_amount,
      currency: currency.toUpperCase(), reason, requested_by: user.id, status: "pending",
    }).select("id").single();
    if (error) return json(500, { error: error.message }, corsHeaders);
    await writeEvent(admin, conversation_id, user.id, "refund_requested", {
      refund_request_id: rr.id, requested_amount, currency,
    });
    return json(200, { id: rr.id }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
