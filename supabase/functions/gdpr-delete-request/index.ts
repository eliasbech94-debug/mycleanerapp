// Account deletion request. Immediately: soft-deactivate profile, revoke
// sessions, unsubscribe from marketing. Schedules permanent deletion after
// retention window unless a legal hold applies.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit, requestFingerprint } from "../_shared/audit.ts";

const RETENTION_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const uid = ctx.user.id;
  const fp = requestFingerprint(req);
  const body = await req.json().catch(() => ({}));
  const reason: string | null = body?.reason ?? null;

  // dedupe: don't allow two active requests
  const { data: existing } = await ctx.admin.from("account_deletion_requests")
    .select("id, status").eq("user_id", uid)
    .in("status", ["requested","deactivated","legal_retention","scheduled"]).maybeSingle();
  if (existing) return json({ ok: true, request: existing, message: "Sletning er allerede undervejs." });

  // Check legal holds for this user
  const { data: hold } = await ctx.admin.rpc("is_under_legal_hold", {
    _target_type: "user", _target_id: uid,
  });
  const isHeld = hold === true;

  // Also check for open disputes / unpaid payouts that block deletion
  const { count: openDisputes } = await ctx.admin.from("stripe_disputes")
    .select("id", { count: "exact", head: true })
    .or(`provider_user_id.eq.${uid},customer_user_id.eq.${uid}`)
    .in("status", ["needs_response","warning_needs_response","under_review","warning_under_review"]);
  const { count: pendingPayouts } = await ctx.admin.from("finance_payouts")
    .select("id", { count: "exact", head: true })
    .eq("provider_user_id", uid).in("status", ["pending","in_transit"]);

  const finLock = (openDisputes ?? 0) > 0 || (pendingPayouts ?? 0) > 0;
  const initialStatus = (isHeld || finLock) ? "legal_retention" : "scheduled";
  const scheduled = initialStatus === "scheduled"
    ? new Date(Date.now() + RETENTION_DAYS * 86400e3).toISOString()
    : null;

  // 1. Insert deletion request
  const { data: reqRow, error: rErr } = await ctx.admin.from("account_deletion_requests").insert({
    user_id: uid, status: initialStatus, reason,
    scheduled_delete_at: scheduled,
    deactivated_at: new Date().toISOString(),
    requested_ip: fp.ip, requested_ua: fp.ua,
    reviewer_notes: finLock ? `open_disputes=${openDisputes ?? 0}, pending_payouts=${pendingPayouts ?? 0}` : null,
  }).select().single();
  if (rErr) return json({ error: rErr.message }, 500);

  // 2. Deactivate profile (soft)
  await ctx.admin.from("profiles").update({
    deactivated_at: new Date().toISOString(),
  }).eq("id", uid);

  // 3. Withdraw marketing consents
  const marketing = ["marketing_email","marketing_sms","push","analytics_cookies"];
  for (const t of marketing) {
    await ctx.admin.from("consent_ledger").insert({
      user_id: uid, consent_type: t, policy_version: "auto-deletion",
      granted: false, ip_address: fp.ip, user_agent: fp.ua,
      source: "account_deletion",
    });
  }

  // 4. Revoke sessions
  try { await ctx.admin.auth.admin.signOut(uid); } catch { /* ignore */ }

  await writeAudit(ctx.admin, req, {
    actor_user_id: uid, actor_role: ctx.roles[0] ?? null,
    action: "gdpr.deletion.requested",
    target_type: "account_deletion_requests", target_id: reqRow.id,
    metadata: { initial_status: initialStatus, legal_hold: isHeld, finLock,
      open_disputes: openDisputes ?? 0, pending_payouts: pendingPayouts ?? 0 },
  });

  return json({ ok: true, request: reqRow });
});
