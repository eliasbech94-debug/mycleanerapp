// STAGING_REQUIRED — Do NOT copy into supabase/functions/ or register in cron
// until: (a) staging validation of dry-run passes, (b) retention policy is
// approved by legal, (c) kill-switch feature flag is provisioned.
//
// Reconciles Storage (`incident-evidence`) against DB rows:
//   - Deletes pending/* objects whose upload session expired > 24h ago and
//     was never finalized.
//   - Deletes rejected/quarantined DB rows + objects after configured
//     retention (default 30 days), unless legal_hold=true.
//   - NEVER deletes verified evidence based solely on missing DB row —
//     surfaces a reconciliation alert instead.
//
// Batch-limited, idempotent, audit-logged. Dry-run + kill-switch supported.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { writeAudit } from "../../../../supabase/functions/_shared/audit.ts";

const BATCH = 100;
const PENDING_GRACE_HOURS = 24;
const REJECTED_RETENTION_DAYS = 30;

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Cron-invoked; accept either service-role Authorization OR internal cron
    // secret header. Deny anything else.
    const cronSecret = Deno.env.get("EVIDENCE_WORKER_CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!cronSecret || provided !== cronSecret) {
      return json(401, { error: "unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false; // default TRUE — safe.
    const killed = Deno.env.get("EVIDENCE_WORKER_KILL") === "1";
    if (killed) return json(503, { error: "killed_by_flag" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const stats = { pending_removed: 0, rejected_removed: 0, alerts: 0, dry_run: dryRun };

    // 1) Expired pending sessions.
    const cutoff = new Date(Date.now() - PENDING_GRACE_HOURS * 3600 * 1000).toISOString();
    const { data: sessions } = await admin
      .from("incident_evidence_upload_sessions")
      .select("id, pending_storage_path")
      .is("finalized_at", null)
      .lt("expires_at", cutoff)
      .limit(BATCH);

    for (const s of sessions ?? []) {
      if (!dryRun) {
        await (admin as any).storage.from("incident-evidence").remove([s.pending_storage_path]);
        await admin.from("incident_evidence_upload_sessions").delete().eq("id", s.id);
      }
      stats.pending_removed++;
    }

    // 2) Rejected/quarantined DB rows past retention (respect legal_hold).
    const retCutoff = new Date(Date.now() - REJECTED_RETENTION_DAYS * 86400_000).toISOString();
    const { data: rejects } = await admin
      .from("incident_evidence")
      .select("id, storage_path, final_storage_path, status, legal_hold, created_at")
      .in("status", ["rejected", "quarantined"])
      .eq("legal_hold", false)
      .lt("created_at", retCutoff)
      .limit(BATCH);

    for (const r of rejects ?? []) {
      const paths = [r.storage_path, r.final_storage_path].filter(Boolean) as string[];
      if (!dryRun) {
        if (paths.length) await (admin as any).storage.from("incident-evidence").remove(paths);
        await admin.from("incident_evidence").delete().eq("id", r.id);
      }
      stats.rejected_removed++;
    }

    // 3) Verified evidence WITHOUT matching DB row -> alert only. Never delete.
    // (Implementation stub — full storage.list() reconciliation is expensive;
    // batch-listed on staging and paged. See docs/security/INCIDENT_EVIDENCE.md.)

    await writeAudit(admin, null, {
      actor_role: "system",
      action: "incident_evidence.worker_tick",
      metadata: stats,
    });

    return json(200, stats);
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
