/**
 * MyCleaner — Privilege Escalation Regression Suite
 *
 * Runs real, unmocked exploit attempts against the live API surface:
 *   - PostgREST direct writes on public.user_roles
 *   - admin-user-role edge function
 *   - SECURITY DEFINER RPCs reachable by authenticated clients
 *   - session invalidation after a role change
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   SA_EMAIL=... SA_PASSWORD=... SUPPORT_EMAIL=... SUPPORT_PASSWORD=... \
 *   T1_EMAIL=... T2_EMAIL=... T_PASSWORD=... \
 *   bun run scripts/privilege-escalation-regression.ts
 *
 * Exits non-zero on any failed assertion.
 */
const URL_ = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;

type Session = { token: string; refresh: string; id: string; label: string };

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(email: string, password: string, label: string): Promise<Session> {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error(`login failed for ${label}: ${JSON.stringify(j)}`);
  return { token: j.access_token, refresh: j.refresh_token, id: j.user.id, label };
}

/** Direct PostgREST write attempt against user_roles. */
async function restWrite(s: Session, method: "POST" | "PATCH" | "DELETE", body?: unknown, qs = "") {
  const r = await fetch(`${URL_}/rest/v1/user_roles${qs}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${s.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, text: await r.text() };
}

async function callFn(s: Session | null, name: string, body: unknown) {
  const r = await fetch(`${URL_}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let j: any = null;
  try { j = await r.json(); } catch { /* ignore */ }
  return { status: r.status, body: j };
}

async function rpc(s: Session, fn: string, args: unknown) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: r.status, text: await r.text() };
}

async function rolesOf(sa: Session, userId: string): Promise<string[]> {
  const r = await fetch(`${URL_}/rest/v1/user_roles?select=role&user_id=eq.${userId}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${sa.token}` },
  });
  const j: any = await r.json();
  return Array.isArray(j) ? j.map((x: any) => x.role) : [];
}

async function main() {
  const sa = await login(process.env.SA_EMAIL!, process.env.SA_PASSWORD!, "super_admin");
  const support = await login(process.env.SUPPORT_EMAIL!, process.env.SUPPORT_PASSWORD!, "support");
  let customer = await login(process.env.T1_EMAIL!, process.env.T_PASSWORD!, "customer");
  const provider = await login(process.env.T2_EMAIL!, process.env.T_PASSWORD!, "provider");

  // ---- Setup: give T2 the provider role (non-privileged, super_admin action)
  await callFn(sa, "admin-user-role", { op: "grant", target_user_id: provider.id, role: "provider" });
  check("setup: provider role granted to T2", (await rolesOf(sa, provider.id)).includes("provider"));

  // =========================================================================
  // 1 & 2 — customer / provider can never become admin or super_admin
  // =========================================================================
  for (const actor of [customer, provider]) {
    for (const role of ["admin", "super_admin"]) {
      const w = await restWrite(actor, "POST", { user_id: actor.id, role });
      check(
        `${actor.label}: direct REST self-grant '${role}' denied`,
        w.status >= 400 && !(await rolesOf(sa, actor.id)).includes(role),
        `HTTP ${w.status}`,
      );
      const f = await callFn(actor, "admin-user-role", {
        op: "grant", target_user_id: actor.id, role,
      });
      check(`${actor.label}: admin-user-role self-grant '${role}' denied`, f.status === 403, `HTTP ${f.status}`);
    }
    // grant to somebody else must also fail
    const other = await callFn(actor, "admin-user-role", {
      op: "grant", target_user_id: sa.id, role: "super_admin",
    });
    check(`${actor.label}: cannot grant roles to other users`, other.status === 403, `HTTP ${other.status}`);
    // UPDATE / DELETE on the role table must be denied too
    const u = await restWrite(actor, "PATCH", { role: "admin" }, `?user_id=eq.${actor.id}`);
    check(`${actor.label}: direct REST UPDATE on user_roles denied`, u.status >= 400, `HTTP ${u.status}`);
    const d = await restWrite(actor, "DELETE", undefined, `?user_id=eq.${actor.id}`);
    check(`${actor.label}: direct REST DELETE on user_roles denied`, d.status >= 400, `HTTP ${d.status}`);
  }

  // =========================================================================
  // 3 — support cannot escalate itself
  // =========================================================================
  for (const role of ["admin", "super_admin", "employee"]) {
    const f = await callFn(support, "admin-user-role", {
      op: "grant", target_user_id: support.id, role,
    });
    check(`support: self-grant '${role}' denied`, f.status === 403, `HTTP ${f.status}`);
  }
  const supRest = await restWrite(support, "POST", { user_id: support.id, role: "super_admin" });
  check(
    "support: direct REST self-grant 'super_admin' denied",
    supRest.status >= 400 && !(await rolesOf(sa, support.id)).includes("super_admin"),
    `HTTP ${supRest.status}`,
  );

  // =========================================================================
  // 5 (part) — super_admin grants 'admin' to T1 so we can test admin limits
  // =========================================================================
  const grantAdmin = await callFn(sa, "admin-user-role", {
    op: "grant", target_user_id: customer.id, role: "admin", reason: "privilege regression",
  });
  check("super_admin: can grant 'admin'", grantAdmin.status === 200, `HTTP ${grantAdmin.status}`);
  check("role change signals client session reload", grantAdmin.body?.session_reload_signalled === true);
  check("role change reports immediate effect", grantAdmin.body?.privileges_effective === "immediate");

  // 7 — the EXISTING (pre-change) token must immediately reflect the new roles:
  // privileges are re-derived server-side per request, never read from the JWT.
  const staleGrant = await callFn(customer, "admin-user-role", {
    op: "grant", target_user_id: provider.id, role: "customer",
  });
  check(
    "existing session immediately gains new privileges without re-login",
    staleGrant.status === 200,
    `HTTP ${staleGrant.status}`,
  );
  const staleRoles = await fetch(`${URL_}/rest/v1/user_roles?select=role&user_id=eq.${provider.id}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${customer.token}` },
  });
  check("existing session sees refreshed roles via RLS (admin read)", staleRoles.status === 200, `HTTP ${staleRoles.status}`);

  // re-login → still an admin (non super_admin) session
  const admin = await login(process.env.T1_EMAIL!, process.env.T_PASSWORD!, "admin");
  customer = admin;

  // =========================================================================
  // 4 — admin cannot make itself super_admin
  // =========================================================================
  const selfSuper = await callFn(admin, "admin-user-role", {
    op: "grant", target_user_id: admin.id, role: "super_admin",
  });
  check("admin: self-grant 'super_admin' denied", selfSuper.status >= 400, `HTTP ${selfSuper.status} ${selfSuper.body?.error}`);
  const selfSuperRest = await restWrite(admin, "POST", { user_id: admin.id, role: "super_admin" });
  check(
    "admin: direct REST self-grant 'super_admin' denied",
    selfSuperRest.status >= 400 && !(await rolesOf(sa, admin.id)).includes("super_admin"),
    `HTTP ${selfSuperRest.status}`,
  );

  // =========================================================================
  // 5 — only super_admin may manage admin / support / employee / super_admin
  // =========================================================================
  for (const role of ["admin", "support", "employee", "super_admin"]) {
    const g = await callFn(admin, "admin-user-role", {
      op: "grant", target_user_id: provider.id, role,
    });
    check(`admin: cannot grant privileged role '${role}'`, g.status === 403, `HTTP ${g.status}`);
    const rv = await callFn(admin, "admin-user-role", {
      op: "revoke", target_user_id: support.id, role,
    });
    check(`admin: cannot revoke privileged role '${role}'`, rv.status === 403, `HTTP ${rv.status}`);
  }
  const restAdminGrant = await restWrite(admin, "POST", { user_id: provider.id, role: "support" });
  check(
    "admin: direct REST grant of 'support' to another user denied",
    restAdminGrant.status >= 400 && !(await rolesOf(sa, provider.id)).includes("support"),
    `HTTP ${restAdminGrant.status}`,
  );

  // =========================================================================
  // 8 — admin edge functions reject customer / provider / support
  // =========================================================================
  const adminFns: { name: string; body: unknown }[] = [
    { name: "admin-user-role", body: { op: "grant", target_user_id: provider.id, role: "admin" } },
    { name: "admin-diagnostics", body: {} },
    { name: "admin-provider-action", body: { target_user_id: provider.id, action: "approve" } },
    { name: "admin-provider-refresh", body: { user_id: provider.id } },
    { name: "admin-country-publish", body: { country_code: "DK" } },
  ];
  for (const fn of adminFns) {
    for (const actor of [provider, support]) {
      const r = await callFn(actor, fn.name, fn.body);
      const ok = r.status === 403 || r.status === 401 || r.status === 404;
      check(`${fn.name}: rejects ${actor.label}`, ok, `HTTP ${r.status}`);
    }
    const anonCall = await callFn(null, fn.name, fn.body);
    check(`${fn.name}: rejects unauthenticated`, anonCall.status === 401 || anonCall.status === 404, `HTTP ${anonCall.status}`);
  }

  // =========================================================================
  // 9 — SECURITY DEFINER RPCs cannot be used to bypass the rules
  // =========================================================================
  const rpcProbes: { fn: string; args: unknown }[] = [
    { fn: "admin_provider_action", args: { _target_user_id: provider.id, _action: "approve", _reason: "exploit" } },
    { fn: "admin_provider_approval_decision", args: { _uid: provider.id, _decision: "approved", _reason: "exploit" } },
    { fn: "admin_reserve_slug_v1", args: { _slug: "exploit-slug", _reason: "exploit" } },
    { fn: "admin_appeal_transition_v1", args: { _appeal_id: "00000000-0000-0000-0000-000000000000", _to_status: "approved", _reason: "x" } },
  ];
  for (const p of rpcProbes) {
    const r = await rpc(provider, p.fn, p.args);
    const denied = r.status >= 400 || /unauthorized|forbidden|permission/i.test(r.text);
    check(`rpc ${p.fn}: denied for provider`, denied, `HTTP ${r.status}`);
    const after = await rolesOf(sa, provider.id);
    check(`rpc ${p.fn}: granted no new roles`, !after.some((x) => ["admin", "super_admin", "support", "employee"].includes(x)));
  }

  // =========================================================================
  // 6 — every role change is audited
  // =========================================================================
  const auditRes = await fetch(
    `${URL_}/rest/v1/admin_audit_log?select=action,actor_user_id,target_id,new_state,created_at&action=like.role.*&order=created_at.desc&limit=10`,
    { headers: { apikey: ANON, Authorization: `Bearer ${sa.token}` } },
  );
  const audit: any = await auditRes.json();
  const auditedGrant = Array.isArray(audit) && audit.some(
    (a: any) => a.action === "role.grant" && a.target_id === admin.id && a.actor_user_id === sa.id,
  );
  check("audit log contains the super_admin role.grant", auditedGrant, `${Array.isArray(audit) ? audit.length : 0} rows`);

  // ---- Cleanup: remove the temporary admin role
  const revoke = await callFn(sa, "admin-user-role", {
    op: "revoke", target_user_id: admin.id, role: "admin", reason: "regression cleanup",
  });
  check("cleanup: super_admin revoked 'admin'", revoke.status === 200 && !(await rolesOf(sa, admin.id)).includes("admin"));
  const auditRes2 = await fetch(
    `${URL_}/rest/v1/admin_audit_log?select=action,target_id&action=eq.role.revoke&target_id=eq.${admin.id}&limit=1`,
    { headers: { apikey: ANON, Authorization: `Bearer ${sa.token}` } },
  );
  const audit2: any = await auditRes2.json();
  check("audit log contains the role.revoke", Array.isArray(audit2) && audit2.length === 1);
  await callFn(sa, "admin-user-role", { op: "revoke", target_user_id: provider.id, role: "provider" });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
