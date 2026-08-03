// Create a private support note about a customer or provider. Support/admin only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { json } from "../_shared/conversations.ts";
import { writeAudit } from "../_shared/audit.ts";
import { isSubjectType, isUuid, shapeNote, subjectExists, validateBody } from "../_shared/supportNotes.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const forbidden = requireRole(ctx, ["support", "admin"] as any, corsHeaders);
    if (forbidden) return forbidden;

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return json(400, { error: "Invalid JSON body" }, corsHeaders);
    }
    const { subject_type, subject_user_id, body, pinned } = payload as Record<string, unknown>;

    if (!isSubjectType(subject_type)) {
      return json(400, { error: "subject_type must be 'customer' or 'provider'" }, corsHeaders);
    }
    if (!isUuid(subject_user_id)) {
      return json(400, { error: "subject_user_id must be a uuid" }, corsHeaders);
    }
    const validated = validateBody(body);
    if (!validated.ok) return json(400, { error: validated.error }, corsHeaders);
    if (pinned !== undefined && typeof pinned !== "boolean") {
      return json(400, { error: "pinned must be a boolean" }, corsHeaders);
    }

    if (!(await subjectExists(ctx.admin, subject_type, subject_user_id))) {
      return json(404, { error: "Subject user not found" }, corsHeaders);
    }

    const { data, error } = await ctx.admin
      .from("support_entity_notes")
      .insert({
        subject_type,
        subject_user_id,
        body: validated.body,
        author_user_id: ctx.user.id,
        pinned: pinned === true,
      })
      .select("*")
      .single();
    if (error) return json(500, { error: error.message }, corsHeaders);

    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id,
      actor_role: ctx.roles.join(","),
      action: "support_note_create",
      target_type: "support_entity_note",
      target_id: data.id,
      new_state: { subject_type, subject_user_id, pinned: data.pinned, body_length: validated.body.length },
    });

    return json(201, { note: shapeNote(data) }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
