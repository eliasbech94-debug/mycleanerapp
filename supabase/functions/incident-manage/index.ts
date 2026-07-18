// Admin CRUD for incidents and alerts.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const op: string = body?.op ?? "list";
  const admin = ctx.admin;

  switch (op) {
    case "list": {
      const { data } = await admin.from("incidents").select("*")
        .order("opened_at", { ascending: false }).limit(100);
      return json({ incidents: data ?? [] });
    }
    case "get": {
      const id = String(body.id);
      const [{ data: inc }, { data: tl }] = await Promise.all([
        admin.from("incidents").select("*").eq("id", id).maybeSingle(),
        admin.from("incident_timeline").select("*").eq("incident_id", id)
          .order("created_at", { ascending: true }),
      ]);
      return json({ incident: inc, timeline: tl ?? [] });
    }
    case "create": {
      const insert = {
        severity: body.severity ?? "SEV-3",
        title: String(body.title ?? "Untitled incident").slice(0, 200),
        summary: body.summary ?? null,
        opened_by: ctx.user.id,
        owner_user_id: ctx.user.id,
        linked_alert_ids: body.linked_alert_ids ?? [],
        linked_deployment_ids: body.linked_deployment_ids ?? [],
      };
      const { data, error } = await admin.from("incidents").insert(insert).select().single();
      if (error) return json({ error: error.message }, 500);
      await admin.from("incident_timeline").insert({
        incident_id: data.id, kind: "note",
        message: "Incident opened", actor_user_id: ctx.user.id,
      });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id, actor_role: "admin",
        action: "incident.created", target_type: "incidents", target_id: data.id, new_state: data,
      });
      return json({ ok: true, incident: data });
    }
    case "update": {
      const id = String(body.id);
      const { data: prev } = await admin.from("incidents").select("*").eq("id", id).maybeSingle();
      const patch: Record<string, unknown> = {};
      for (const k of ["severity","status","title","summary","owner_user_id","root_cause","resolution","follow_up_actions"]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (body.status === "resolved") patch.resolved_at = new Date().toISOString();
      const { data, error } = await admin.from("incidents").update(patch).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      await admin.from("incident_timeline").insert({
        incident_id: id, kind: prev?.status !== data.status ? "status_change" : "note",
        message: body.note ?? `Updated: ${Object.keys(patch).join(", ")}`,
        actor_user_id: ctx.user.id, metadata: { patch },
      });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id, actor_role: "admin",
        action: "incident.updated", target_type: "incidents", target_id: id,
        previous_state: prev, new_state: data,
      });
      return json({ ok: true, incident: data });
    }
    case "resolve_alert": {
      const key = String(body.alert_key);
      const { data } = await admin.rpc("resolve_system_alert", {
        _alert_key: key, _resolver: ctx.user.id,
      });
      await writeAudit(admin, req, {
        actor_user_id: ctx.user.id, actor_role: "admin",
        action: "alert.resolved", target_type: "system_alerts", target_id: key,
        metadata: { affected: data },
      });
      return json({ ok: true, resolved: data });
    }
    default:
      return json({ error: "bad_op" }, 400);
  }
});
