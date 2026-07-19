import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  tag_slug: z.string().min(1).max(64),
  remove: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, tag_slug, remove } = parsed.data;
    const { admin, user } = ctx;
    const { data: tag } = await admin.from("conversation_tags").select("id").eq("slug", tag_slug).maybeSingle();
    if (!tag) return json(404, { error: "tag_not_found" }, corsHeaders);
    if (remove) {
      await admin.from("conversation_tag_assignments").delete()
        .eq("conversation_id", conversation_id).eq("tag_id", tag.id);
    } else {
      await admin.from("conversation_tag_assignments").upsert({
        conversation_id, tag_id: tag.id, assigned_by: user.id,
      }, { onConflict: "conversation_id,tag_id" });
    }
    await writeEvent(admin, conversation_id, user.id, remove ? "tag_removed" : "tag_added", { tag_slug });
    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
