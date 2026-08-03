// Career evidence upload.
// Two-step flow:
// 1. init      → validate ownership + record state, return short-lived signed
//                upload URL with a server-generated path scoped to the user.
// 2. finalize  → insert career_evidence_documents metadata row (RLS + trigger
//                also verify the ownership + protected columns).
//
// Provider may only upload to their own records. Reject if the record is
// already `verified`. Enforce MIME allow-list + 10 MB cap server-side.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "career-evidence";

const Target = z.union([
  z.object({ evidence_type: z.literal("work_history"), work_history_id: z.string().uuid() }),
  z.object({ evidence_type: z.literal("certification"), certification_id: z.string().uuid() }),
]);

const Init = z.object({ step: z.literal("init"), mime_type: z.string(), size_bytes: z.number().int().positive().max(MAX_BYTES), original_filename: z.string().max(200).optional() }).and(Target);
const Finalize = z.object({ step: z.literal("finalize"), storage_path: z.string().min(3), mime_type: z.string(), size_bytes: z.number().int().positive().max(MAX_BYTES), original_filename: z.string().max(200).optional() }).and(Target);

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function verifyRecordOwnership(
  admin: any,
  userId: string,
  target: { evidence_type: "work_history"; work_history_id: string } | { evidence_type: "certification"; certification_id: string },
): Promise<{ recordId: string; verified: boolean }> {
  if (target.evidence_type === "work_history") {
    const { data, error } = await admin
      .from("cleaner_work_history")
      .select("id, verification_status, cleaner_career_profiles!inner(user_id)")
      .eq("id", target.work_history_id)
      .maybeSingle();
    if (error || !data) throw new Error("record_not_found");
    if ((data as any).cleaner_career_profiles.user_id !== userId) throw new Error("forbidden");
    return { recordId: data.id, verified: data.verification_status === "verified" };
  }
  const { data, error } = await admin
    .from("cleaner_certifications")
    .select("id, verification_status, cleaner_career_profiles!inner(user_id)")
    .eq("id", target.certification_id)
    .maybeSingle();
  if (error || !data) throw new Error("record_not_found");
  if ((data as any).cleaner_career_profiles.user_id !== userId) throw new Error("forbidden");
  return { recordId: data.id, verified: data.verification_status === "verified" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const raw = await req.json();

    if (raw.step === "init") {
      const parsed = Init.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const p = parsed.data;
      if (!ALLOWED_MIME.has(p.mime_type)) return json(415, { error: "mime_not_allowed" });

      const { recordId, verified } = await verifyRecordOwnership(ctx.admin, ctx.user.id, p);
      if (verified) return json(409, { error: "record_already_verified" });

      const ext = MIME_EXT[p.mime_type];
      const path = `${ctx.user.id}/${p.evidence_type}/${recordId}/${crypto.randomUUID()}.${ext}`;

      const { data, error } = await (ctx.admin as any).storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (error) return json(500, { error: error.message });

      return json(200, {
        storage_path: path,
        upload_url: data.signedUrl,
        token: data.token,
        expires_in: 300,
      });
    }

    if (raw.step === "finalize") {
      const parsed = Finalize.safeParse(raw);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const p = parsed.data;
      if (!ALLOWED_MIME.has(p.mime_type)) return json(415, { error: "mime_not_allowed" });

      const { recordId, verified } = await verifyRecordOwnership(ctx.admin, ctx.user.id, p);
      if (verified) return json(409, { error: "record_already_verified" });

      // Enforce server-side path scoping — path must belong to caller
      const expectedPrefix = `${ctx.user.id}/${p.evidence_type}/${recordId}/`;
      if (!p.storage_path.startsWith(expectedPrefix)) {
        return json(400, { error: "path_scope_invalid" });
      }

      const insertRow: Record<string, unknown> = {
        user_id: ctx.user.id,
        storage_path: p.storage_path,
        original_filename: p.original_filename ?? null,
        mime_type: p.mime_type,
        size_bytes: p.size_bytes,
        evidence_type: p.evidence_type,
        status: "pending",
      };
      if (p.evidence_type === "work_history") {
        insertRow.work_history_id = (p as any).work_history_id;
      } else {
        insertRow.certification_id = (p as any).certification_id;
      }

      const { data, error } = await ctx.admin
        .from("career_evidence_documents")
        .insert(insertRow)
        .select("id")
        .single();
      if (error) return json(500, { error: error.message });

      // Also set parent record to pending review
      const parentTable = p.evidence_type === "work_history" ? "cleaner_work_history" : "cleaner_certifications";
      await ctx.admin
        .from(parentTable)
        .update({ verification_status: "pending" })
        .eq("id", recordId)
        .in("verification_status", ["self_reported", "more_information_required", "rejected"]);

      await ctx.admin.from("career_audit_log").insert({
        actor_user_id: ctx.user.id,
        action: "evidence.upload",
        entity_type: "career_evidence_document",
        entity_id: data.id,
        new_value: { evidence_type: p.evidence_type, record_id: recordId, mime_type: p.mime_type, size_bytes: p.size_bytes },
        request_id: req.headers.get("x-request-id"),
      });

      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id,
        action: "career_evidence.uploaded",
        target_type: "career_evidence_document",
        target_id: data.id,
        metadata: { evidence_type: p.evidence_type, record_id: recordId, size_bytes: p.size_bytes, mime: p.mime_type },
      });

      return json(200, { id: data.id, storage_path: p.storage_path });
    }

    return json(400, { error: "invalid_step" });
  } catch (e) {
    const m = (e as Error).message;
    const status = m === "forbidden" ? 403 : m === "record_not_found" ? 404 : 500;
    return json(status, { error: m });
  }
});
