// Scheduled retention worker. Iterates data_retention_policies and either
// dry-runs (counts only) or executes deletions/anonymisations. Always writes
// a retention_worker_runs row with the full report.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireServiceOrAdmin } from "../_shared/auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { monitored } from "../_shared/logger.ts";
import { startJobRun } from "../_shared/jobrun.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface PolicyRun {
  record_type: string;
  candidates: number;
  affected: number;
  skipped_legal_hold: number;
  action: string;
  dry_run: boolean;
  notes?: string;
}

async function runPolicy(policy: any, forceDry: boolean): Promise<PolicyRun> {
  const dry = forceDry || policy.dry_run || !policy.enabled;
  const cutoff = new Date(Date.now() - policy.retention_days * 86400e3).toISOString();
  const res: PolicyRun = {
    record_type: policy.record_type, candidates: 0, affected: 0,
    skipped_legal_hold: 0, action: policy.action, dry_run: dry,
  };

  switch (policy.record_type) {
    case "sms_verifications": {
      const q = admin.from("sms_verifications").select("id", { count: "exact", head: true })
        .lt("created_at", cutoff);
      const { count } = await q;
      res.candidates = count ?? 0;
      if (!dry && res.candidates > 0) {
        const { count: deleted } = await admin.from("sms_verifications")
          .delete({ count: "exact" }).lt("created_at", cutoff);
        res.affected = deleted ?? 0;
      }
      break;
    }
    case "notification_outbox": {
      const { count } = await admin.from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .lt("created_at", cutoff).in("status", ["sent","failed"]);
      res.candidates = count ?? 0;
      if (!dry && res.candidates > 0) {
        const { count: deleted } = await admin.from("notification_outbox")
          .delete({ count: "exact" })
          .lt("created_at", cutoff).in("status", ["sent","failed"]);
        res.affected = deleted ?? 0;
      }
      break;
    }
    case "gdpr_export_files": {
      const { data: exp } = await admin.from("gdpr_export_jobs")
        .select("id, storage_path").eq("status", "ready").lt("expires_at", new Date().toISOString());
      res.candidates = exp?.length ?? 0;
      if (!dry && exp && exp.length) {
        for (const e of exp) {
          if (e.storage_path) await admin.storage.from("gdpr-exports").remove([e.storage_path]);
          await admin.from("gdpr_export_jobs").update({
            status: "expired", storage_path: null,
          }).eq("id", e.id);
        }
        res.affected = exp.length;
      }
      break;
    }
    case "unverified_accounts": {
      // best-effort: rely on profiles without full_name older than cutoff
      const { count } = await admin.from("profiles")
        .select("id", { count: "exact", head: true })
        .is("full_name", null).lt("created_at", cutoff);
      res.candidates = count ?? 0;
      res.notes = "Read-only in worker; use admin action to delete auth users.";
      break;
    }
    default:
      res.notes = "policy_declared_only";
  }
  return res;
}

Deno.serve(monitored("gdpr-retention-worker", async (req, _log) => {
  const _run = await startJobRun("gdpr-retention-worker", _log.correlationId);
  try {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const gate = await requireServiceOrAdmin(req, corsHeaders);
  if (gate instanceof Response) return gate;

  const body = await req.json().catch(() => ({}));
  const forceDry: boolean = body?.dry_run === true;

  const { data: run } = await admin.from("retention_worker_runs")
    .insert({ dry_run: forceDry, status: "running" }).select().single();

  try {
    const { data: policies } = await admin.from("data_retention_policies").select("*").eq("enabled", true);
    const report: PolicyRun[] = [];
    const counts: Record<string, number> = {};
    for (const p of (policies ?? [])) {
      const r = await runPolicy(p, forceDry);
      report.push(r);
      counts[r.record_type] = r.affected;
    }
    await admin.from("retention_worker_runs").update({
      status: "completed", finished_at: new Date().toISOString(),
      report: report as unknown as Record<string, unknown>, affected_counts: counts,
    }).eq("id", run!.id);
    return json({ ok: true, run_id: run!.id, report });
  } catch (e) {
    await admin.from("retention_worker_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: (e as Error).message,
    }).eq("id", run!.id);
    return json({ error: (e as Error).message }, 500);
  }

  } catch (e) { await _run.finish("failed", {}, e); throw e; }
  finally { try { await _run.finish("completed", {}); } catch {} }
}));
