// Returns a short-lived signed download URL for an attachment after RLS-like
// participant + internal-note visibility checks.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { assertVisible, isStaff, json } from "../_shared/conversations.ts";

const Body = z.object({ attachment_id: z.string().uuid(), expires_in: z.number().int().min(30).max(3600).optional() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
    const { attachment_id, expires_in } = parsed.data;
    const { admin, user } = ctx;

    const { data: att } = await admin.from("message_attachments")
      .select("id, storage_path, messages!inner(id, conversation_id, is_internal_note)")
      .eq("id", attachment_id).maybeSingle();
    if (!att) return json(404, { error: "not_found" }, corsHeaders);
    const msg: any = (att as any).messages;
    await assertVisible(admin, msg.conversation_id, user.id);
    if (msg.is_internal_note && !isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);

    const { data, error } = await (admin as any).storage.from("chat-attachments")
      .createSignedUrl(att.storage_path, expires_in ?? 300);
    if (error) return json(500, { error: error.message }, corsHeaders);
    return json(200, { url: data.signedUrl }, corsHeaders);
  } catch (e) {
    const m = (e as Error).message;
    return json(m === "forbidden" ? 403 : 500, { error: m }, corsHeaders);
  }
});
