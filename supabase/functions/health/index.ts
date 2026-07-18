// Public health probe. Returns healthy | degraded | unhealthy only —
// no counts, no infrastructure details.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  // 1) DB reachable
  let dbOk = false;
  try {
    const { error } = await admin.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    dbOk = !error;
  } catch { dbOk = false; }

  // 2) Any open critical alerts?
  let hasCritical = false, hasWarning = false;
  try {
    const { data } = await admin.from("system_alerts")
      .select("severity").eq("status", "open");
    for (const a of (data ?? [])) {
      if (a.severity === "critical") hasCritical = true;
      else if (a.severity === "warning") hasWarning = true;
    }
  } catch { /* treat as degraded */ hasWarning = true; }

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (!dbOk || hasCritical) status = "unhealthy";
  else if (hasWarning) status = "degraded";

  return json({ status });
});
