// POST /identity-reconcile
// Server-side reconciliation when a Sumsub webhook is missing or delayed.
// Body (admin only): { user_id?: string }. Providers reconcile themselves.
// Pulls the authoritative applicant status from Sumsub, persists it and
// re-runs the approval engine. Never trusts client-supplied status.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { loadSumsubConfig, getApplicantStatus } from "../_shared/sumsub.ts";
import { isSandboxResult, resolveSumsubEnv } from "../_shared/sumsubEnv.ts";
import { evaluateProviderApproval, notifyApprovalRegression } from "../_shared/providerApproval.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => ({}));
  const isAdmin = ctx.roles.includes("admin") || ctx.roles.includes("super_admin");
  const targetId = isAdmin && typeof body?.user_id === "string" ? body.user_id : ctx.user.id;

  const cfg = loadSumsubConfig();
  if (!cfg) return json({ error: "identity_provider_unconfigured" }, 503);

  const { data: link } = await ctx.admin.from("identity_account_links")
    .select("identity_id").eq("user_id", targetId).maybeSingle();
  if (!link?.identity_id) return json({ error: "identity_not_found" }, 404);

  const { data: ident } = await ctx.admin.from("person_identities")
    .select("id, external_ref").eq("id", link.identity_id).maybeSingle();
  if (!ident?.external_ref) return json({ error: "applicant_not_created" }, 409);

  let remote: Awaited<ReturnType<typeof getApplicantStatus>>;
  try {
    remote = await getApplicantStatus(cfg, ident.external_ref);
  } catch (e) {
    console.error("identity_reconcile_failed", (e as Error).message);
    // Fail closed: unknown remote state never upgrades anything.
    return json({ error: "sumsub_unreachable" }, 502);
  }

  const envDecision = resolveSumsubEnv(cfg.baseUrl, cfg.appToken);
  const summary = remote.reviewSummary as Record<string, unknown>;
  const sandbox = isSandboxResult(
    (summary.sandboxMode as boolean | undefined) ?? null,
    envDecision,
  );

  const nowIso = new Date().toISOString();
  await ctx.admin.from("person_identities").update({
    status: remote.status,
    last_review_at: nowIso,
    metadata: summary,
    ...(remote.status === "approved" ? { verified_at: nowIso } : {}),
  }).eq("id", ident.id);

  const { data: pp } = await ctx.admin.from("provider_profiles")
    .select("user_id").eq("user_id", targetId).maybeSingle();

  if (pp) {
    await ctx.admin.rpc("apply_provider_identity_sync", {
      _uid: targetId,
      _status: remote.status,
      _sandbox: sandbox,
      _applicant_id: ident.external_ref,
    });
    const approval = await evaluateProviderApproval(ctx.admin, targetId, "identity_reconcile");
    if (approval) await notifyApprovalRegression(ctx.admin, targetId, approval);
    console.log(JSON.stringify({
      evt: "identity.reconciled",
      applicant_id: ident.external_ref,
      identity_status: remote.status,
      sandbox,
      environment: envDecision.environment,
      approval_state: approval?.state ?? null,
      at: nowIso,
    }));
    return json({
      identity_status: remote.status,
      sandbox,
      approval_state: approval?.state ?? null,
    });
  }

  return json({ identity_status: remote.status, sandbox });
});
