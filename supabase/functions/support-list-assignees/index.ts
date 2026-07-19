// Returns the list of users eligible to be assigned to a support conversation.
// Only support/admin/super_admin roles. Support-safe, staff-only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { isStaff, json } from "../_shared/conversations.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    if (!isStaff(ctx)) return json(403, { error: "forbidden" }, corsHeaders);
    const { admin } = ctx;

    const { data: roles, error } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["support", "admin", "super_admin"]);
    if (error) return json(500, { error: error.message }, corsHeaders);

    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(String(r.role));
      byUser.set(r.user_id, arr);
    }
    const ids = [...byUser.keys()];
    if (ids.length === 0) return json(200, { assignees: [] }, corsHeaders);

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, deactivated_at")
      .in("id", ids);

    const assignees = (profiles ?? [])
      .filter((p) => !p.deactivated_at)
      .map((p) => ({
        user_id: p.id,
        full_name: p.full_name ?? "(uden navn)",
        roles: byUser.get(p.id) ?? [],
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "da"));

    return json(200, { assignees }, corsHeaders);
  } catch (e) {
    return json(500, { error: (e as Error).message }, corsHeaders);
  }
});
