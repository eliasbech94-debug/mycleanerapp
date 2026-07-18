// Server-side readiness evaluator. Runs a battery of checks against a country
// config + related resources and persists the result to country_readiness_runs.
// Admin-only. Never mutates lifecycle_state itself — a human must promote.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Check = { id: string; ok: boolean; detail?: string };

async function runChecks(iso: string): Promise<{ passed: boolean; version: number; checks: Check[] }> {
  const checks: Check[] = [];
  const { data: cfg } = await admin
    .from("country_configs").select("*").eq("iso", iso).maybeSingle();

  if (!cfg) return { passed: false, version: 0, checks: [{ id: "config_exists", ok: false, detail: "no country_configs row" }] };

  const push = (id: string, ok: boolean, detail?: string) => checks.push({ id, ok, detail });

  push("config_published", cfg.status === "published", `status=${cfg.status}`);
  push("currency_supported", ["DKK","GBP","SEK","EUR"].includes(cfg.currency), cfg.currency);
  push("timezone_set", !!cfg.timezone);
  push("commission_valid", Number.isInteger(cfg.commission_bps) && cfg.commission_bps > 0 && cfg.commission_bps < 10000);
  push("vat_valid", Number.isInteger(cfg.vat_rate_bps) && cfg.vat_rate_bps >= 0 && cfg.vat_rate_bps < 10000);
  push("booking_rules_present", cfg.booking_rules && Object.keys(cfg.booking_rules).length > 0);
  push("pricing_rules_present", cfg.pricing_rules && Object.keys(cfg.pricing_rules).length > 0);

  // Legal docs — need terms + privacy published in every supported language
  const langs: string[] = cfg.supported_languages ?? [cfg.default_language];
  for (const kind of ["terms","privacy"]) {
    for (const lng of langs) {
      const { count } = await admin
        .from("legal_documents").select("id", { head: true, count: "exact" })
        .eq("country_code", iso).eq("kind", kind).eq("language", lng).eq("status","published");
      push(`legal_${kind}_${lng}`, (count ?? 0) > 0);
    }
  }

  // Holidays — at least 5 seeded rows for current or upcoming year
  const year = new Date().getUTCFullYear();
  const { count: hcount } = await admin
    .from("country_holidays").select("id", { head: true, count: "exact" })
    .eq("country_code", iso).gte("holiday_date", `${year}-01-01`);
  push("holiday_calendar", (hcount ?? 0) >= 5, `${hcount} holidays`);

  // Payment methods and Stripe readiness (private config)
  const priv = cfg.config ?? {};
  push("payment_methods_configured", Array.isArray(priv.payment_methods) && priv.payment_methods.length > 0);
  push("stripe_account_configured", typeof priv.stripe_account_id === "string" && priv.stripe_account_id.length > 0);
  push("webhook_ready", !!priv.webhook_registered);

  // Contact + privacy
  push("privacy_contact_present", !!(priv.contact?.privacy_email));
  push("support_contact_present", !!(priv.contact?.support_email));

  // No unresolved critical alerts scoped to this country
  const { count: critAlerts } = await admin
    .from("system_alerts").select("id", { head: true, count: "exact" })
    .eq("status","open").eq("severity","critical").contains("metadata", { country: iso });
  push("no_critical_alerts", (critAlerts ?? 0) === 0);

  const passed = checks.every(c => c.ok);
  return { passed, version: cfg.config_version, checks };
}

Deno.serve(monitored("country-readiness", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const iso = (url.searchParams.get("iso") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return json({ error: "iso required" }, 400);

  const { passed, version, checks } = await runChecks(iso);
  await admin.from("country_readiness_runs").insert({
    iso, config_version: version, passed, checks,
    actor: ctx.userId, actor_kind: "admin",
    deployment_version: Deno.env.get("DEPLOYMENT_VERSION") ?? null,
  });
  return json({ iso, passed, config_version: version, checks });
}));

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
