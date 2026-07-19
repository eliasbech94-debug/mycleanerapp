// Shared server-side auth + role helpers for edge functions.
// Always enforce these in addition to RLS — never trust client-side guards.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AppRole =
  | "super_admin"
  | "admin"
  | "support"
  | "employee"
  | "provider"
  | "customer";

export interface AuthContext {
  user: { id: string; email: string | null };
  roles: AppRole[];
  isSuperAdmin: boolean;
  admin: SupabaseClient; // service-role client
}

function jsonError(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Validate the request's JWT and load the user's roles via service-role.
 * Returns either an `AuthContext` or a 401 `Response` to short-circuit.
 */
export async function authenticate(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthContext | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return jsonError(401, { error: "Unauthorized" }, corsHeaders);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    auth.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) {
    return jsonError(401, { error: "Unauthorized" }, corsHeaders);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", claims.claims.sub);
  if (roleErr) {
    return jsonError(500, { error: "Role lookup failed" }, corsHeaders);
  }

  const roles = (roleRows ?? []).map((r) => r.role as AppRole);
  return {
    user: {
      id: claims.claims.sub,
      email: (claims.claims.email as string | undefined) ?? null,
    },
    roles,
    isSuperAdmin: roles.includes("super_admin"),
    admin,
  };
}

/**
 * Returns 403 if the user holds none of `allowed` (super_admin always passes).
 * Use after `authenticate` succeeds.
 */
export function requireRole(
  ctx: AuthContext,
  allowed: AppRole[],
  corsHeaders: Record<string, string>,
): Response | null {
  if (ctx.isSuperAdmin) return null;
  if (ctx.roles.some((r) => allowed.includes(r))) return null;
  return jsonError(
    403,
    { error: "Forbidden", required: allowed, have: ctx.roles },
    corsHeaders,
  );
}

/**
 * For cron / internal endpoints. Accepts requests signed with the service-role
 * key (Supabase scheduled invocations) OR an authenticated admin user.
 */
export async function requireServiceOrAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthContext | Response | "service"> {
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth === `Bearer ${serviceKey}`) return "service";

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;
  return ctx;
}
