// Generates a JSON export bundle for one queued job and uploads it to the
// private 'gdpr-exports' bucket. Callable by service role only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { collectUserData } from "../_shared/gdpr.ts";
import { writeAudit } from "../_shared/audit.ts";

import { monitored } from "../_shared/logger.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPIRY_HOURS = 24 * 7; // 7 days

Deno.serve(monitored("gdpr-export-worker", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_KEY}`) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const jobId: string | undefined = body.job_id;

  // Pick job(s) to process
  let jobs: { id: string; user_id: string }[] = [];
  if (jobId) {
    const { data } = await admin.from("gdpr_export_jobs")
      .select("id, user_id").eq("id", jobId).eq("status", "queued");
    jobs = data ?? [];
  } else {
    const { data } = await admin.from("gdpr_export_jobs")
      .select("id, user_id").eq("status", "queued").limit(5);
    jobs = data ?? [];
  }

  const results: unknown[] = [];
  for (const job of jobs) {
    await admin.from("gdpr_export_jobs").update({ status: "running" }).eq("id", job.id);
    try {
      const bundle = await collectUserData(admin, job.user_id);
      const payload = {
        generated_at: new Date().toISOString(),
        user_id: job.user_id,
        notice: "Dette dokument indeholder dine personoplysninger i henhold til GDPR art. 15. Følsomme identifikatorer (CPR/CVR, kortnumre, bankoplysninger) er maskeret. Krypterede felter og interne systemdata er udeladt.",
        data: bundle,
      };
      const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      const path = `${job.user_id}/${job.id}.json`;

      const up = await admin.storage.from("gdpr-exports").upload(path, bytes, {
        contentType: "application/json", upsert: true,
      });
      if (up.error) throw up.error;

      const expires = new Date(Date.now() + EXPIRY_HOURS * 3600e3).toISOString();
      await admin.from("gdpr_export_jobs").update({
        status: "ready", storage_path: path, file_bytes: bytes.byteLength,
        ready_at: new Date().toISOString(), expires_at: expires,
      }).eq("id", job.id);

      await writeAudit(admin, null, {
        actor_user_id: null, actor_role: "system",
        action: "gdpr.export.ready", target_type: "gdpr_export_jobs", target_id: job.id,
        metadata: { bytes: bytes.byteLength },
      });
      results.push({ id: job.id, ok: true, bytes: bytes.byteLength });
    } catch (e) {
      await admin.from("gdpr_export_jobs").update({
        status: "failed", error_message: (e as Error).message,
      }).eq("id", job.id);
      results.push({ id: job.id, ok: false, error: (e as Error).message });
    }
  }

  return json({ processed: results.length, results });
}));
