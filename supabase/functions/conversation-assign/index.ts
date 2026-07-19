import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { isAdmin, isStaff, json, writeEvent } from "../_shared/conversations.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  assignee_user_id: z.string().uuid().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { conversation_id, assignee_user_id } = parsed.data;
    const { admin, user } = ctx;

    if (assignee_user_id && assignee_user_id !== user.id && !isAdmin(ctx)) {
      // Non-admin support can only assign to self
      return json(403, { error: "only_admin_can_assign_others" }, corsHeaders);
    }

    const { error } = await admin.from("conversations")
      .update({ assigned_support_id: assignee_user_id })
      .eq("id", conversation_id);
    if (error) return json(500, { error: error.message }, corsHeaders);

    // Auto-add assignee as participant
    if (assignee_user_id) {
      await admin.from("conversation_participants").upsert({
        conversation_id, user_id: assignee_user_id, participant_role: "support",
      }, { onConflict: "conversation_id,user_id" });
    }
    await writeEvent(admin, conversation_id, user.id, assignee_user_id ? "assigned" : "unassigned", { assignee_user_id });
    return json(200, { ok: true }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
