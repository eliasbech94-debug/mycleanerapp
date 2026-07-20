// POST /provider-document-upload — returns a signed upload URL to
// provider-documents/<uid>/<kind>/<uuid>.<ext>. Owner-only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_KINDS = new Set(["insurance", "other"]);
const ALLOWED_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp",
]);
const ALLOWED_EXT: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind ?? "");
    const contentType = String(body?.content_type ?? "");
    if (!ALLOWED_KINDS.has(kind)) return json({ error: "invalid_kind", allowed: [...ALLOWED_KINDS] }, 400);
    if (!ALLOWED_MIME.has(contentType)) return json({ error: "invalid_content_type", allowed: [...ALLOWED_MIME] }, 400);

    const ext = ALLOWED_EXT[contentType];
    const path = `${ctx.user.id}/${kind}/${crypto.randomUUID()}.${ext}`;

    const { data, error } = await ctx.admin.storage
      .from("provider-documents")
      .createSignedUploadUrl(path);
    if (error) return json({ error: "signed_upload_failed", message: error.message }, 500);

    return json({ ok: true, path, token: data.token, signed_url: data.signedUrl });
  } catch (e) {
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
