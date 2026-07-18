// Thin helper for background jobs to record a job_runs row with counts.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { scrubForLog } from "./logger.ts";

const RELEASE = Deno.env.get("APP_RELEASE") ?? "unknown";

let admin: SupabaseClient | null = null;
function getAdmin() {
  if (admin) return admin;
  admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return admin;
}

export interface JobCounters {
  processed?: number;
  success?: number;
  failed?: number;
  retry?: number;
}

export async function startJobRun(jobName: string, correlationId?: string) {
  const client = getAdmin();
  const { data } = await client.from("job_runs").insert({
    job_name: jobName,
    deployment_release: RELEASE,
    correlation_id: correlationId ?? null,
  }).select().single();
  return {
    id: data?.id as string,
    started: performance.now(),
    async finish(status: "completed" | "failed" | "cancelled",
                 counters: JobCounters = {},
                 error?: unknown,
                 metadata?: Record<string, unknown>) {
      const duration = Math.round(performance.now() - this.started);
      const errMsg = error
        ? (error instanceof Error ? error.message : String(error)).slice(0, 2000)
        : null;
      await client.from("job_runs").update({
        finished_at: new Date().toISOString(),
        status,
        duration_ms: duration,
        processed_count: counters.processed ?? 0,
        success_count: counters.success ?? 0,
        failed_count: counters.failed ?? 0,
        retry_count: counters.retry ?? 0,
        error_summary: errMsg,
        metadata: metadata ? scrubForLog(metadata) : {},
      }).eq("id", data!.id);
    },
  };
}
