// Records a deployment marker. Called from CI or manually; correlates release with error spikes.
// Auth: service-role or admin.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { monitored } from "../_shared/logger.ts";
import { requireServiceOrAdmin } from "../_shared/auth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(monitored("deployment-record", async (req, log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const guard = await requireServiceOrAdmin(req, corsHeaders);
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => ({}));
  const {
    release, environment, git_commit, migration_version,
    edge_function_versions, status = "success", rollback_of = null, notes = null,
  } = body ?? {};

  if (!release || !environment) return json({ error: "release_and_environment_required" }, 400);

  const { data, error } = await admin.from("deployments").insert({
    release, environment, git_commit, migration_version,
    edge_function_versions: edge_function_versions ?? null,
    status, rollback_of, notes, deployed_at: new Date().toISOString(),
  }).select().single();

  if (error) { await log.error(error, { category: "deployment_write" }); return json({ error: error.message }, 500); }
  log.info("deployment.recorded", { release, environment, status });
  return json({ ok: true, deployment: data });
}));
