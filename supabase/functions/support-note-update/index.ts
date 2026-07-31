// Update a private support note (own note body, or pin state). Support/admin only.
// No deletion in Phase 1.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { json } from "../_shared/conversations.ts";
import { writeAudit } from "../_shared/audit.ts";
import { isUuid, shapeNote, validateBody } from "../_shared/supportNotes.ts";

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
    const { note_id, body, pinned } = payload as Record<string, unknown>;

    if (!isUuid(note_id)) return json(400, { error: "note_id must be a uuid" }, corsHeaders);
    if (body === undefined && pinned === undefined) {
      return json(400, { error: "Nothing to update" }, corsHeaders);
    }
    if (pinned !== undefined && typeof pinned !== "boolean") {
      return json(400, { error: "pinned must be a boolean" }, corsHeaders);
    }

    const { data: existing, error: readErr } = await ctx.admin
      .from("support_entity_notes")
      .select("*")
      .eq("id", note_id)
      .maybeSingle();
    if (readErr) return json(500, { error: readErr.message }, corsHeaders);
    if (!existing) return json(404, { error: "Note not found" }, corsHeaders);

    const patch: Record<string, unknown> = {};

    if (body !== undefined) {
      // Only the author may rewrite the note text; pinning is a shared action.
      if (existing.author_user_id !== ctx.user.id) {
        return json(403, { error: "Only the author can edit this note" }, corsHeaders);
      }
      const validated = validateBody(body);
      if (!validated.ok) return json(400, { error: validated.error }, corsHeaders);
      patch.body = validated.body;
    }
    if (pinned !== undefined) patch.pinned = pinned;

    const { data, error } = await ctx.admin
      .from("support_entity_notes")
      .update(patch)
      .eq("id", note_id)
      .select("*")
      .single();
    if (error) return json(500, { error: error.message }, corsHeaders);

    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id,
      actor_role: ctx.roles.join(","),
      action: "support_note_update",
      target_type: "support_entity_note",
      target_id: note_id,
      previous_state: { pinned: existing.pinned, body_length: String(existing.body ?? "").length },
      new_state: { pinned: data.pinned, body_length: String(data.body ?? "").length },
    });

    return json(200, { note: shapeNote(data) }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
