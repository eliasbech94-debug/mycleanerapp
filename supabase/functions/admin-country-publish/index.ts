// Admin publish for a country configuration.
// Draft → Validation → Publish. Optimistic concurrency: caller must submit the
// config_version they saw. Idempotency-Key dedupes retries. On successful
// publish, the DB trigger snapshots into country_config_versions.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Very small server-side schema check — expand as the config grows.
function validateDraft(cfg: Record<string, unknown>): string[] {
  const errs: string[] = [];
  if (!cfg.currency || typeof cfg.currency !== "string" || !/^[A-Z]{3}$/.test(cfg.currency as string)) {
    errs.push("currency: must be ISO-4217 (3 uppercase letters)");
  }
  if (typeof cfg.commission_bps !== "number" || cfg.commission_bps < 0 || cfg.commission_bps > 10000) {
    errs.push("commission_bps: 0..10000 required");
  }
  if (typeof cfg.vat_rate_bps !== "number" || cfg.vat_rate_bps < 0 || cfg.vat_rate_bps > 10000) {
    errs.push("vat_rate_bps: 0..10000 required");
  }
  if (!cfg.timezone) errs.push("timezone: required");
  if (!cfg.default_language) errs.push("default_language: required");
  return errs;
}

Deno.serve(monitored("admin-country-publish", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const idempotencyKey = req.headers.get("Idempotency-Key") ?? "";
  const body = await req.json().catch(() => null) as
    | { iso?: string; expected_version?: number; draft?: Record<string, unknown>; change_summary?: string }
    | null;
  if (!body?.iso || !body?.draft || typeof body.expected_version !== "number") {
    return json({ error: "iso, expected_version and draft are required" }, 400);
  }
  const iso = body.iso.toUpperCase();

  const errors = validateDraft(body.draft);
  if (errors.length) return json({ error: "validation_failed", details: errors }, 422);

  // Concurrency: check current version matches.
  const { data: current, error: currentErr } = await admin
    .from("country_configs")
    .select("config_version, status")
    .eq("iso", iso)
    .maybeSingle();
  if (currentErr) return json({ error: currentErr.message }, 500);
  if (current && current.config_version !== body.expected_version) {
    return json({
      error: "conflict",
      message: `stored version ${current.config_version} differs from expected ${body.expected_version}`,
    }, 409);
  }

  // Idempotency: if the same key already produced a published version, return it.
  if (idempotencyKey) {
    const { data: dup } = await admin
      .from("country_config_versions")
      .select("config_version, published_at, snapshot")
      .eq("iso", iso)
      .contains("snapshot", { __idempotency_key: idempotencyKey })
      .maybeSingle();
    if (dup) return json({ idempotent: true, ...dup }, 200);
  }

  const merged = {
    ...body.draft,
    iso,
    status: "published",
    published_by: ctx.userId,
    published_at: new Date().toISOString(),
  };
  // Stamp idempotency key inside snapshot for future dedupe reads.
  if (idempotencyKey) (merged as Record<string, unknown>).__idempotency_key = idempotencyKey;

  const { data: upserted, error: upErr } = await admin
    .from("country_configs")
    .upsert(merged, { onConflict: "iso" })
    .select("iso, config_version, published_at")
    .single();
  if (upErr) return json({ error: upErr.message }, 409);

  await admin.from("admin_audit_log").insert({
    action: "country.publish",
    actor_user_id: ctx.userId,
    target_type: "country_config",
    target_id: iso,
    metadata: { config_version: upserted.config_version, change_summary: body.change_summary ?? null },
  });

  return json({ ok: true, ...upserted });
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
