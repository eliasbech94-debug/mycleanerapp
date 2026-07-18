// Append-only consent ledger. GET returns latest state per type;
// POST records a grant/withdraw event.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate } from "../_shared/auth.ts";
import { requestFingerprint, writeAudit } from "../_shared/audit.ts";

const TYPES = new Set(["terms","privacy","marketing_email","marketing_sms","push","analytics_cookies"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const uid = ctx.user.id;

  if (req.method === "GET") {
    const { data } = await ctx.admin.from("consent_ledger")
      .select("consent_type, policy_version, granted, created_at")
      .eq("user_id", uid).order("created_at", { ascending: false });
    const latest: Record<string, unknown> = {};
    for (const row of (data ?? [])) {
      if (!latest[row.consent_type]) latest[row.consent_type] = row;
    }
    return json({ latest, history: data ?? [] });
  }

  const body = await req.json().catch(() => ({}));
  const type: string = body?.consent_type;
  if (!TYPES.has(type)) return json({ error: "invalid_type" }, 400);
  const granted = !!body?.granted;
  const version: string = String(body?.policy_version ?? "1.0");
  const source: string = String(body?.source ?? "web");
  const fp = requestFingerprint(req);

  const { data, error } = await ctx.admin.from("consent_ledger").insert({
    user_id: uid, consent_type: type, granted, policy_version: version,
    ip_address: fp.ip, user_agent: fp.ua, source,
    country_code: body?.country_code ?? null,
  }).select().single();
  if (error) return json({ error: error.message }, 500);

  await writeAudit(ctx.admin, req, {
    actor_user_id: uid, actor_role: ctx.roles[0] ?? null,
    action: granted ? "gdpr.consent.granted" : "gdpr.consent.withdrawn",
    target_type: "consent_ledger", target_id: data.id,
    metadata: { type, version, source },
  });

  return json({ ok: true, entry: data });
});
