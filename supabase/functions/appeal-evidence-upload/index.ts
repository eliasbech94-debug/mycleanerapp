// POST /appeal-evidence-upload — provider uploads a document supporting their
// appeal. The bucket is private; only the owner and staff can ever read it, and
// only through a short-lived signed URL from /appeal-evidence-url.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";

const BUCKET = "appeal-evidence";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const Body = z.object({
  appeal_id: z.string().uuid(),
  file_name: z.string().min(1).max(200),
  content_type: z.string().min(3).max(100),
  size_bytes: z.number().int().positive().max(MAX_BYTES),
  data_base64: z.string().min(1),
});

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten().fieldErrors });
    const { appeal_id, file_name, content_type, size_bytes, data_base64 } = parsed.data;

    if (!ALLOWED_TYPES.has(content_type)) return json(400, { error: "unsupported_content_type" });

    // Ownership + open-state check happens server-side; never trust the client.
    const { data: appeal, error: aErr } = await ctx.admin
      .from("provider_appeals")
      .select("id, provider_user_id, status")
      .eq("id", appeal_id)
      .maybeSingle();
    if (aErr) return json(500, { error: aErr.message });
    if (!appeal) return json(404, { error: "appeal_not_found" });
    if (appeal.provider_user_id !== ctx.user.id) return json(403, { error: "not_authorized" });
    if (["upheld", "changed", "withdrawn"].includes(appeal.status)) {
      return json(409, { error: "appeal_closed" });
    }

    let bytes: Uint8Array;
    try {
      const raw = data_base64.includes(",") ? data_base64.split(",")[1] : data_base64;
      bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } catch {
      return json(400, { error: "invalid_base64" });
    }
    // Verify the real byte length rather than the client's claim.
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return json(400, { error: "invalid_size" });
    if (bytes.byteLength !== size_bytes) return json(400, { error: "size_mismatch" });

    const storagePath = `${appeal.provider_user_id}/${appeal_id}/${crypto.randomUUID()}.${EXT[content_type]}`;
    const { error: upErr } = await (ctx.admin as any).storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: content_type, upsert: false });
    if (upErr) return json(500, { error: upErr.message });

    const { data: row, error: insErr } = await ctx.admin
      .from("provider_appeal_attachments")
      .insert({
        appeal_id,
        uploaded_by: ctx.user.id,
        storage_path: storagePath,
        file_name: file_name.slice(0, 200),
        content_type,
        size_bytes: bytes.byteLength,
      })
      .select("id, file_name, content_type, size_bytes, created_at")
      .maybeSingle();
    if (insErr) {
      await (ctx.admin as any).storage.from(BUCKET).remove([storagePath]);
      return json(500, { error: insErr.message });
    }

    await ctx.admin.from("provider_appeal_events").insert({
      appeal_id,
      actor_user_id: ctx.user.id,
      actor_role: "provider",
      event_type: "evidence_uploaded",
      note: file_name.slice(0, 200),
    });

    return json(200, { ok: true, attachment: row });
  } catch (e) {
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
