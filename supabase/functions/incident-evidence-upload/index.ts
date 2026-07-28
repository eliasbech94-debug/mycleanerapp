// Incident evidence upload.
// - init: verify caller owns incident_report or is staff editor; return signed
//   upload URL with server-generated path <incident_id>/<uuid>.<ext>.
// - finalize: insert incident_evidence row (trigger validates path + limits).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 10 * 1024 * 1024;

const Init = z.object({
  step: z.literal("init"),
  incident_id: z.string().uuid(),
  mime_type: z.string(),
  size_bytes: z.number().int().positive().max(MAX_BYTES),
  original_filename: z.string().max(200).optional(),
});
const Finalize = z.object({
  step: z.literal("finalize"),
  incident_id: z.string().uuid(),
  storage_path: z.string().min(3),
  mime_type: z.string(),
  size_bytes: z.number().int().positive().max(MAX_BYTES),
  original_filename: z.string().max(200).optional(),
  file_hash: z.string().min(16).max(128).optional(),
  caption: z.string().max(500).optional(),
});

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function ensureAccess(admin: any, incident_id: string, user_id: string, isStaff: boolean) {
  const { data } = await admin
    .from("incident_reports")
    .select("id, provider_user_id")
    .eq("id", incident_id)
    .maybeSingle();
  if (!data) throw new Error("incident_not_found");
  if (!isStaff && data.provider_user_id !== user_id) throw new Error("forbidden");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const isStaff = ctx.isSuperAdmin || ctx.roles.some((r) =>
      ["admin", "support", "employee"].includes(r)
    );

    const raw = await req.json();

    if (raw.step === "init") {
      const parsed = Init.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const { incident_id, mime_type, size_bytes } = parsed.data;
      if (!ALLOWED_MIME.has(mime_type)) return json(415, { error: "mime_not_allowed" });
      await ensureAccess(ctx.admin, incident_id, ctx.user.id, isStaff);

      const ext = MIME_EXT[mime_type];
      const path = `${incident_id}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await (ctx.admin as any).storage
        .from("incident-evidence")
        .createSignedUploadUrl(path);
      if (error) return json(500, { error: error.message });
      return json(200, {
        storage_path: path,
        upload_url: data.signedUrl,
        token: data.token,
        size_bytes,
        mime_type,
      });
    }

    if (raw.step === "finalize") {
      const parsed = Finalize.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const p = parsed.data;
      if (!ALLOWED_MIME.has(p.mime_type)) return json(415, { error: "mime_not_allowed" });
      await ensureAccess(ctx.admin, p.incident_id, ctx.user.id, isStaff);

      // Path must belong to this incident (trigger also validates)
      if (!p.storage_path.startsWith(`${p.incident_id}/`)) {
        return json(400, { error: "path_scope_invalid" });
      }

      const { data, error } = await ctx.admin
        .from("incident_evidence")
        .insert({
          incident_id: p.incident_id,
          storage_path: p.storage_path,
          mime_type: p.mime_type,
          file_size: p.size_bytes,
          original_filename: p.original_filename ?? null,
          file_hash: p.file_hash ?? null,
          caption: p.caption ?? null,
          uploaded_by: ctx.user.id,
        })
        .select("id")
        .single();
      if (error) return json(500, { error: error.message });

      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id,
        action: "incident_evidence.uploaded",
        target_type: "incident_evidence",
        target_id: data.id,
        metadata: {
          incident_id: p.incident_id,
          bytes: p.size_bytes,
          mime: p.mime_type,
        },
      });
      return json(200, { id: data.id });
    }

    return json(400, { error: "invalid_step" });
  } catch (e) {
    const m = (e as Error).message;
    const status = m === "forbidden" ? 403 : m === "incident_not_found" ? 404 : 500;
    return json(status, { error: m });
  }
});
