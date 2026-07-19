import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";

const ALLOWED = ["open", "pending_customer", "pending_provider", "pending_support", "escalated", "resolved", "closed"] as const;
const Body = z.object({
  conversation_id: z.string().uuid(),
  status: z.enum(ALLOWED),
  reason: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, status, reason } = parsed.data;
    const { admin, user } = ctx;
    const patch: Record<string, unknown> = { status };
    if (status === "closed" || status === "resolved") {
      patch.closed_at = new Date().toISOString();
      patch.closed_by = user.id;
    }
    const { error } = await admin.from("conversations").update(patch).eq("id", conversation_id);
    if (error) return json(500, { error: error.message }, corsHeaders);
    await writeEvent(admin, conversation_id, user.id, "status_changed", { status, reason });
    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
