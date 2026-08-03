// POST /appeal-evidence-url — short-lived signed URL for one appeal attachment.
// Readable by the owning provider (their own evidence) and by admin/support
// reviewing the appeal. The URL is never persisted; every open is audited.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const BUCKET = "appeal-evidence";
const MAX_EXPIRES = 300;

const Body = z.object({
  attachment_id: z.string().uuid(),
  expires_in: z.number().int().min(30).max(MAX_EXPIRES).optional(),
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
    const { attachment_id, expires_in } = parsed.data;

    const { data: att, error } = await ctx.admin
      .from("provider_appeal_attachments")
      .select("id, storage_path, content_type, appeal_id, provider_appeals!inner(provider_user_id)")
      .eq("id", attachment_id)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!att) return json(404, { error: "not_found" });

    const ownerId = (att as { provider_appeals?: { provider_user_id?: string } }).provider_appeals?.provider_user_id;
    const isStaff = ctx.roles?.some((r: string) => ["admin", "super_admin", "support"].includes(r)) ?? false;
    if (ownerId !== ctx.user.id && !isStaff) return json(403, { error: "not_authorized" });

    const ttl = expires_in ?? MAX_EXPIRES;
    const { data: signed, error: sErr } = await (ctx.admin as any).storage
      .from(BUCKET)
      .createSignedUrl(att.storage_path, ttl);
    if (sErr) return json(500, { error: sErr.message });

    if (isStaff && ownerId !== ctx.user.id) {
      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: ctx.isSuperAdmin ? "super_admin" : "admin",
        action: "appeal_evidence.download",
        target_type: "provider_appeal_attachment",
        target_id: att.id,
        metadata: { appeal_id: att.appeal_id, subject_user_id: ownerId },
      });
    }

    return json(200, { url: signed.signedUrl, expires_in: ttl });
  } catch (e) {
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
