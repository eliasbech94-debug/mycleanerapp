// Career verification decision endpoint.
// Admin-only. Updates verification_status on the parent record, sets reviewer
// metadata, records a reviewer note, and appends to career_audit_log.
// Providers cannot reach these columns via RLS (owner_guard trigger blocks).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const Body = z.object({
  kind: z.enum(["work_history", "certification"]),
  record_id: z.string().uuid(),
  decision: z.enum(["verified", "rejected", "more_information_required", "under_review"]),
  note: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
  document_ids: z.array(z.string().uuid()).optional(),
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
    const { kind, record_id, decision, note, reason, document_ids } = parsed.data;

    const table = kind === "work_history" ? "cleaner_work_history" : "cleaner_certifications";

    const { data: prev, error: prevErr } = await ctx.admin
      .from(table)
      .select("id, verification_status, verified_by, verified_at")
      .eq("id", record_id)
      .maybeSingle();
    if (prevErr) return json(500, { error: prevErr.message });
    if (!prev) return json(404, { error: "record_not_found" });

    const patch: Record<string, unknown> = { verification_status: decision };
    if (decision === "verified") {
      patch.verified_at = new Date().toISOString();
      patch.verified_by = ctx.user.id;
      if (kind === "work_history") patch.verification_method = "manual_review";
    } else {
      patch.verified_at = null;
      patch.verified_by = null;
    }
    if (kind === "work_history" && note !== undefined) {
      patch.evidence_review_note = note;
    }

    const { data: updated, error: upErr } = await ctx.admin
      .from(table)
      .update(patch)
      .eq("id", record_id)
      .select("id, verification_status")
      .single();
    if (upErr) return json(500, { error: upErr.message });

    // Cascade status to referenced documents when reviewing
    if (document_ids && document_ids.length > 0) {
      const docStatus = decision === "verified"
        ? "verified"
        : decision === "rejected"
          ? "rejected"
          : decision === "more_information_required"
            ? "more_information_required"
            : "under_review";
      await ctx.admin
        .from("career_evidence_documents")
        .update({
          status: docStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: ctx.user.id,
          rejection_reason: decision === "rejected" ? (reason ?? null) : null,
        })
        .in("id", document_ids);
    }

    await ctx.admin.from("career_audit_log").insert({
      actor_user_id: ctx.user.id,
      action: `verification.${decision}`,
      entity_type: kind,
      entity_id: record_id,
      previous_value: { verification_status: prev.verification_status, verified_by: prev.verified_by, verified_at: prev.verified_at },
      new_value: { verification_status: updated.verification_status },
      reason: reason ?? null,
      request_id: req.headers.get("x-request-id"),
    });

    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id,
      actor_role: ctx.isSuperAdmin ? "super_admin" : "admin",
      action: `career_verification.${decision}`,
      target_type: kind,
      target_id: record_id,
      previous_state: { verification_status: prev.verification_status },
      new_state: { verification_status: updated.verification_status },
    });

    return json(200, { ok: true, verification_status: updated.verification_status });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
