import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, priority } = parsed.data;
    const { admin, user } = ctx;
    const { error } = await admin.from("conversations").update({ priority }).eq("id", conversation_id);
    if (error) return json(500, { error: error.message }, corsHeaders);
    await writeEvent(admin, conversation_id, user.id, "priority_changed", { priority });
    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
