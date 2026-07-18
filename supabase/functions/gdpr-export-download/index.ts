// Returns a short-lived signed URL for the user's ready export.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const { job_id } = await req.json().catch(() => ({}));
  if (!job_id) return json({ error: "bad_request" }, 400);

  const { data: job } = await ctx.admin.from("gdpr_export_jobs")
    .select("*").eq("id", job_id).maybeSingle();
  if (!job || job.user_id !== ctx.user.id) return json({ error: "not_found" }, 404);
  if (job.status !== "ready" || !job.storage_path) return json({ error: "not_ready" }, 409);
  if (job.expires_at && new Date(job.expires_at) < new Date()) {
    await ctx.admin.from("gdpr_export_jobs").update({ status: "expired" }).eq("id", job.id);
    return json({ error: "expired" }, 410);
  }

  const { data: signed, error } = await ctx.admin.storage
    .from("gdpr-exports").createSignedUrl(job.storage_path, 300); // 5 min
  if (error) return json({ error: error.message }, 500);

  await ctx.admin.from("gdpr_export_jobs").update({
    downloaded_at: new Date().toISOString(),
    download_count: (job.download_count ?? 0) + 1,
  }).eq("id", job.id);

  await writeAudit(ctx.admin, req, {
    actor_user_id: ctx.user.id, actor_role: ctx.roles[0] ?? null,
    action: "gdpr.export.downloaded", target_type: "gdpr_export_jobs", target_id: job.id,
  });

  return json({ url: signed.signedUrl, expires_in: 300 });
});
