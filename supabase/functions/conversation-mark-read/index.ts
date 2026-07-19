import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { assertVisible, json } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  last_read_message_id: z.string().uuid().optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, last_read_message_id } = parsed.data;
    const { admin, user } = ctx;
    await assertVisible(admin, conversation_id, user.id);
    const { error } = await admin.from("conversation_reads").upsert({
      conversation_id,
      user_id: user.id,
      last_read_message_id: last_read_message_id ?? null,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "conversation_id,user_id" });
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    const m = (e as Error).message;
    return json(m === "forbidden" ? 403 : 500, { error: m }, corsHeaders);
  }
});
