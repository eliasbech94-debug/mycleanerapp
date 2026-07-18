// Admin-only management of legal holds.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const op: string = body?.op ?? "list";

  if (op === "list") {
    const { data } = await ctx.admin.from("legal_holds")
      .select("*").order("created_at", { ascending: false }).limit(500);
    return json({ holds: data ?? [] });
  }

  if (op === "create") {
    const insert = {
      target_type: body.target_type, target_id: String(body.target_id),
      reason: String(body.reason ?? ""), created_by: ctx.user.id,
      ends_at: body.ends_at ?? null, notes: body.notes ?? null,
    };
    const { data, error } = await ctx.admin.from("legal_holds").insert(insert).select().single();
    if (error) return json({ error: error.message }, 500);
    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id, actor_role: "admin",
      action: "legal_hold.created", target_type: "legal_holds", target_id: data.id,
      new_state: data,
    });
    return json({ ok: true, hold: data });
  }

  if (op === "release") {
    const id = String(body.id);
    const { data: prev } = await ctx.admin.from("legal_holds").select("*").eq("id", id).maybeSingle();
    const { data, error } = await ctx.admin.from("legal_holds").update({
      active: false, released_at: new Date().toISOString(), released_by: ctx.user.id,
    }).eq("id", id).select().single();
    if (error) return json({ error: error.message }, 500);
    await writeAudit(ctx.admin, req, {
      actor_user_id: ctx.user.id, actor_role: "admin",
      action: "legal_hold.released", target_type: "legal_holds", target_id: id,
      previous_state: prev, new_state: data,
    });
    return json({ ok: true, hold: data });
  }

  return json({ error: "bad_op" }, 400);
});
