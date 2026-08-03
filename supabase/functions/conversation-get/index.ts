import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { assertVisible, isStaff, json } from "../_shared/conversations.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const conversation_id = url.searchParams.get("id");
    if (!conversation_id) return json(400, { error: "id required" }, corsHeaders);
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const { admin, user } = ctx;

    await assertVisible(admin, conversation_id, user.id);
    const staff = isStaff(ctx);

    const [conv, parts, tags, reads] = await Promise.all([
      admin.from("conversations").select("*").eq("id", conversation_id).maybeSingle(),
      admin.from("conversation_participants").select("*").eq("conversation_id", conversation_id).is("left_at", null),
      admin.from("conversation_tag_assignments").select("tag_id, conversation_tags(name, slug)").eq("conversation_id", conversation_id),
      admin.from("conversation_reads").select("*").eq("conversation_id", conversation_id).eq("user_id", user.id).maybeSingle(),
    ]);

    let msgQ = admin.from("messages")
      .select("id, sender_user_id, sender_role, sender_type, ai_drafted, ai_draft_reviewed_by, message_type, body, is_internal_note, reply_to_message_id, edited_at, created_at, message_attachments(id, original_filename, mime_type, size_bytes, storage_path)")
      .eq("conversation_id", conversation_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!staff) msgQ = msgQ.eq("is_internal_note", false);
    if (cursor) msgQ = msgQ.lt("created_at", cursor);
    const { data: messages } = await msgQ;

    let events: unknown[] | null = null;
    if (staff) {
      const { data: ev } = await admin.from("conversation_events")
        .select("*").eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false }).limit(100);
      events = ev;
    }

    return json(200, {
      conversation: conv.data,
      participants: parts.data ?? [],
      tags: tags.data ?? [],
      read: reads.data,
      messages: (messages ?? []).reverse(),
      events,
    }, corsHeaders);
  } catch (e) {
    const m = (e as Error).message;
    return json(m === "forbidden" ? 403 : 500, { error: m }, corsHeaders);
  }
});
