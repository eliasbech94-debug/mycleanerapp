// Returns a short-lived signed download URL for incident evidence.
// - Provider: only their own incident's evidence.
// - Staff (admin/support/employee/super_admin): full read; super_admin reads
//   are written to admin_audit_log.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const Body = z.object({
  evidence_id: z.string().uuid(),
  expires_in: z.number().int().min(30).max(600).optional(),
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
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { evidence_id, expires_in } = parsed.data;

    const { data: ev } = await ctx.admin
      .from("incident_evidence")
      .select("id, storage_path, incident_id, mime_type")
      .eq("id", evidence_id)
      .maybeSingle();
    if (!ev) return json(404, { error: "not_found" });

    const isStaff = ctx.isSuperAdmin ||
      ctx.roles.some((r) => ["admin", "support", "employee"].includes(r));
    if (!isStaff) {
      const { data: rep } = await ctx.admin
        .from("incident_reports")
        .select("provider_user_id")
        .eq("id", ev.incident_id)
        .maybeSingle();
      if (!rep || rep.provider_user_id !== ctx.user.id) {
        return json(403, { error: "forbidden" });
      }
    }

    const { data: signed, error } = await (ctx.admin as any).storage
      .from("incident-evidence")
      .createSignedUrl(ev.storage_path, expires_in ?? 120);
    if (error) return json(500, { error: error.message });

    if (ctx.isSuperAdmin || ctx.roles.includes("admin")) {
      await writeAudit(ctx.admin, req, {
        actor_user_id: ctx.user.id,
        actor_role: ctx.isSuperAdmin ? "super_admin" : "admin",
        action: "incident_evidence.download",
        target_type: "incident_evidence",
        target_id: ev.id,
        metadata: { incident_id: ev.incident_id, mime: ev.mime_type },
      });
    }

    return json(200, { url: signed.signedUrl, expires_in: expires_in ?? 120 });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
