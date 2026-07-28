// Career evidence signed download URL.
// - Admin only. Support is intentionally excluded from raw file access
//   (they can review metadata via the admin API but must escalate for the file).
// - Signed URL expires in <= 5 minutes.
// - We audit the OPEN action (who + what) but never persist the URL itself.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const BUCKET = "career-evidence";
const MAX_EXPIRES = 300; // 5 minutes

const Body = z.object({
  document_id: z.string().uuid(),
  expires_in: z.number().int().min(30).max(MAX_EXPIRES).optional(),
});

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const forbidden = requireRole(ctx, ["admin"], corsHeaders);
    if (forbidden) return forbidden;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { document_id, expires_in } = parsed.data;

    const { data: doc, error } = await ctx.admin
      .from("career_evidence_documents")
      .select("id, storage_path, user_id, evidence_type, work_history_id, certification_id, mime_type")
      .eq("id", document_id)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!doc) return json(404, { error: "not_found" });

    const ttl = expires_in ?? MAX_EXPIRES;
    const { data: signed, error: sErr } = await (ctx.admin as any).storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, ttl);
    if (sErr) return json(500, { error: sErr.message });

    // Audit the open — deliberately does NOT include the signed URL
    await ctx.admin.from("career_audit_log").insert({
      actor_user_id: ctx.user.id,
      action: "evidence.open",
      entity_type: "career_evidence_document",
      entity_id: doc.id,
      new_value: {
        evidence_type: doc.evidence_type,
        work_history_id: doc.work_history_id,
        certification_id: doc.certification_id,
        subject_user_id: doc.user_id,
        mime_type: doc.mime_type,
        expires_in: ttl,
      },
      request_id: req.headers.get("x-request-id"),
    });

    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id,
      actor_role: ctx.isSuperAdmin ? "super_admin" : "admin",
      action: "career_evidence.download",
      target_type: "career_evidence_document",
      target_id: doc.id,
      metadata: { subject_user_id: doc.user_id, mime: doc.mime_type },
    });

    return json(200, { url: signed.signedUrl, expires_in: ttl });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
