// Server-side feature-flag evaluation. Deterministic rollout via SHA-256(seed|subject).
// Kill-switch (enabled=false at global scope) always wins.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function bucket(seed: string, subject: string): Promise<number> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}|${subject}`));
  const view = new DataView(buf);
  return view.getUint32(0) % 100;
}

Deno.serve(monitored("feature-flag-evaluate", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const flagKey = url.searchParams.get("flag");
  const country = url.searchParams.get("country")?.toUpperCase();
  const subject = ctx.userId;
  if (!flagKey) return json({ error: "flag required" }, 400);

  const { data: rows } = await admin
    .from("feature_flags")
    .select("*")
    .eq("flag_key", flagKey);

  const flags = rows ?? [];
  // Kill switch: any global scope row with enabled=false forces off.
  const globalKill = flags.find((f) => f.scope === "global" && !f.enabled);
  if (globalKill) return json({ enabled: false, reason: "kill_switch" });

  // Priority: user > provider > country > global
  const byScope = (scope: string, targetId: string | null) =>
    flags.find((f) => f.scope === scope && (targetId ? f.target_id === targetId : true));

  const chosen =
    byScope("user", subject) ??
    (country ? byScope("country", country) : undefined) ??
    byScope("global", null);

  if (!chosen) return json({ enabled: false, reason: "no_flag" });

  if (chosen.rollout_pct != null && chosen.rollout_pct < 100 && chosen.enabled) {
    const b = await bucket(chosen.rollout_seed ?? flagKey, subject);
    if (b >= chosen.rollout_pct) return json({ enabled: false, reason: "rollout_bucket", bucket: b });
  }
  return json({ enabled: !!chosen.enabled, reason: chosen.reason ?? chosen.scope });
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
