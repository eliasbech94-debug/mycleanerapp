// List private support notes for one subject. Support/admin only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { json } from "../_shared/conversations.ts";
import { isSubjectType, isUuid, shapeNote } from "../_shared/supportNotes.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const forbidden = requireRole(ctx, ["support", "admin"] as any, corsHeaders);
    if (forbidden) return forbidden;

    const url = new URL(req.url);
    const subjectType = url.searchParams.get("subject_type");
    const subjectUserId = url.searchParams.get("subject_user_id");
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;

    if (!isSubjectType(subjectType)) {
      return json(400, { error: "subject_type must be 'customer' or 'provider'" }, corsHeaders);
    }
    if (!isUuid(subjectUserId)) {
      return json(400, { error: "subject_user_id must be a uuid" }, corsHeaders);
    }

    const { data, error } = await ctx.admin
      .from("support_entity_notes")
      .select("*")
      .eq("subject_type", subjectType)
      .eq("subject_user_id", subjectUserId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json(500, { error: error.message }, corsHeaders);

    return json(200, { notes: (data ?? []).map(shapeNote) }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
