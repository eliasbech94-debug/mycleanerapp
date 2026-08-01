// admin-user-role — grant/revoke roles with audit + privilege-escalation guard.
import { authenticate, requireRole, type AppRole } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALL_ROLES: AppRole[] = ["customer", "provider", "employee", "support", "admin", "super_admin"];
// Privileged (staff) roles — ONLY an existing super_admin may grant or revoke these.
const PRIVILEGED_ROLES: AppRole[] = ["employee", "support", "admin", "super_admin"];

/** Best-effort global session invalidation so revoked privileges stop applying immediately. */
async function invalidateUserSessions(userId: string): Promise<boolean> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}/logout`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "global" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  const op = body?.op as "grant" | "revoke";
  const target_user_id = body?.target_user_id as string;
  const role = body?.role as AppRole;
  const reason = (body?.reason as string) ?? null;

  if (!["grant", "revoke"].includes(op)) return json(400, { error: "invalid_op" });
  if (typeof target_user_id !== "string" || target_user_id.length < 10)
    return json(400, { error: "invalid_target_user_id" });
  if (!ALL_ROLES.includes(role)) return json(400, { error: "invalid_role" });

  // Privilege escalation guard: ONLY an existing super_admin may grant or revoke
  // staff roles (employee, support, admin, super_admin). Plain admins are limited
  // to the non-privileged marketplace roles (customer, provider).
  if (PRIVILEGED_ROLES.includes(role) && !ctx.isSuperAdmin) {
    return json(403, { error: "only_super_admin_can_manage_privileged_roles" });
  }
  // No one may change their own role (avoid self-lockout / self-escalation).
  if (target_user_id === ctx.user.id) {
    return json(400, { error: "cannot_change_own_role" });
  }

  // Load previous roles for audit + guards.
  const { data: prevRows, error: prevErr } = await ctx.admin
    .from("user_roles").select("role").eq("user_id", target_user_id);
  if (prevErr) return json(500, { error: "role_lookup_failed" });
  const prevRoles = (prevRows ?? []).map((r: any) => r.role as AppRole);

  if (op === "grant") {
    if (prevRoles.includes(role)) return json(200, { ok: true, no_change: true });
    const { error } = await ctx.admin.from("user_roles").insert({
      user_id: target_user_id, role,
    });
    if (error) return json(500, { error: error.message });
  } else {
    if (!prevRoles.includes(role)) return json(200, { ok: true, no_change: true });
    const { error } = await ctx.admin.from("user_roles")
      .delete().eq("user_id", target_user_id).eq("role", role);
    if (error) {
      // Last super_admin guard raises check_violation.
      const msg = /cannot_remove_last_super_admin/.test(error.message)
        ? "cannot_remove_last_super_admin"
        : error.message;
      return json(400, { error: msg });
    }
  }

  const newRoles = op === "grant"
    ? Array.from(new Set([...prevRoles, role]))
    : prevRoles.filter((r) => r !== role);

  await writeAudit(ctx.admin, req, {
    actor_user_id: ctx.user.id,
    actor_role: ctx.isSuperAdmin ? "super_admin" : "admin",
    action: op === "grant" ? "role.grant" : "role.revoke",
    target_type: "user",
    target_id: target_user_id,
    previous_state: { roles: prevRoles },
    new_state: { roles: newRoles },
    metadata: { role, reason },
  });

  return json(200, { ok: true, roles: newRoles });
});
