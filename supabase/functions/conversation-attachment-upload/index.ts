// Returns a short-lived signed *upload* URL for a chat attachment, after
// verifying that the caller is a conversation participant and the mime
// type / size are allowed. The client uploads the file directly to storage,
// then calls this function again with `finalize=true` and metadata to record
// the attachment row.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { ALLOWED_MIME, assertParticipant, json, sanitizeFilename } from "../_shared/conversations.ts";

const Init = z.object({
  step: z.literal("init"),
  conversation_id: z.string().uuid(),
  filename: z.string().min(1).max(200),
  mime_type: z.string().min(3).max(100),
  size_bytes: z.number().int().positive().max(26214400),
});
const Finalize = z.object({
  step: z.literal("finalize"),
  conversation_id: z.string().uuid(),
  message_id: z.string().uuid(),
  storage_path: z.string().min(3),
  original_filename: z.string().max(200),
  mime_type: z.string(),
  size_bytes: z.number().int().positive(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const raw = await req.json();
    const { admin, user } = ctx;

    if (raw.step === "init") {
      const parsed = Init.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
      const { conversation_id, filename, mime_type, size_bytes } = parsed.data;
      if (!ALLOWED_MIME.has(mime_type)) return json(415, { error: "mime_not_allowed" }, corsHeaders);
      await assertParticipant(admin, conversation_id, user.id);
      const safe = sanitizeFilename(filename);
      const key = `${conversation_id}/pending/${crypto.randomUUID()}/${safe}`;
      const { data, error } = await (admin as any).storage.from("chat-attachments").createSignedUploadUrl(key);
      if (error) return json(500, { error: error.message }, corsHeaders);
      return json(200, { path: key, upload_url: data.signedUrl, token: data.token, size_bytes, mime_type }, corsHeaders);
    }
    if (raw.step === "finalize") {
      const parsed = Finalize.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() }, corsHeaders);
      const { conversation_id, message_id, storage_path, original_filename, mime_type, size_bytes } = parsed.data;
      if (!ALLOWED_MIME.has(mime_type)) return json(415, { error: "mime_not_allowed" }, corsHeaders);
      await assertParticipant(admin, conversation_id, user.id);
      // Verify message ownership
      const { data: msg } = await admin.from("messages").select("id, sender_user_id, conversation_id").eq("id", message_id).maybeSingle();
      if (!msg || msg.sender_user_id !== user.id || msg.conversation_id !== conversation_id) {
        return json(403, { error: "not_message_owner" }, corsHeaders);
      }
      const { data: att, error } = await admin.from("message_attachments").insert({
        message_id, storage_path, original_filename, mime_type, size_bytes,
      }).select("id").single();
      if (error) return json(500, { error: error.message }, corsHeaders);
      return json(200, { id: att.id }, corsHeaders);
    }
    return json(400, { error: "invalid_step" }, corsHeaders);
  } catch (e) {
    const m = (e as Error).message;
    return json(m === "not_participant" ? 403 : 500, { error: m }, corsHeaders);
  }
});
