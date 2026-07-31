// GET/POST /identity-selftest — admin-only Sumsub environment diagnostics.
//
// Read-only against Sumsub: it never creates an applicant and never mutates
// MyCleaner state. It exists to answer, with evidence rather than assumption:
//   1. Which Sumsub environment are we actually pointed at (sandbox vs prod)?
//   2. Are the API credentials valid?
//   3. Do the configured verification levels actually exist in that account?
//   4. Would a Sumsub result be trusted for approval right now?
//
// Secret hygiene: never returns or logs a secret. Tokens are reported as
// presence + last-4 only; the base URL is reported as scheme+host only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";
import { signSumsubRequest } from "../_shared/sumsub-signing.ts";
import { resolveSumsubEnv } from "../_shared/sumsubEnv.ts";
import { readEnv, resolveEnvironment } from "../_shared/env.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Presence + last-4 only. Never the value. */
function mask(v: string | undefined | null) {
  if (!v) return { present: false as const, last4: null, length: 0 };
  return { present: true as const, last4: v.slice(-4), length: v.length };
}

/** Scheme + host only — strips any credential accidentally embedded in a URL. */
function safeHost(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "invalid_url";
  }
}

async function probe(
  base: string,
  appToken: string,
  secretKey: string,
  method: "GET" | "POST",
  path: string,
): Promise<{ status: number; ok: boolean; note: string }> {
  try {
    const headers = await signSumsubRequest({ appToken, secretKey, method, path, body: "" });
    const res = await fetch(base + path, {
      method,
      headers: { ...headers, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    // Only surface Sumsub's own short error description, never our payload.
    let note = "";
    try {
      const j = JSON.parse(text);
      note = String(j.description ?? j.error ?? "").slice(0, 200);
    } catch {
      note = text.slice(0, 120);
    }
    return { status: res.status, ok: res.ok, note };
  } catch (e) {
    return { status: 0, ok: false, note: `transport_error: ${(e as Error).name}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;

  const appToken = Deno.env.get("SUMSUB_APP_TOKEN") ?? "";
  const secretKey = Deno.env.get("SUMSUB_SECRET_KEY") ?? "";
  const webhookSecret = Deno.env.get("SUMSUB_WEBHOOK_SECRET") ?? "";
  const baseUrlRaw = Deno.env.get("SUMSUB_BASE_URL") ?? "";
  const providerLevel = Deno.env.get("SUMSUB_PROVIDER_LEVEL") ?? "";
  const customerLevel = Deno.env.get("SUMSUB_CUSTOMER_LEVEL") ?? "";

  const host = safeHost(baseUrlRaw);
  const envDecision = resolveSumsubEnv(baseUrlRaw);
  const platformEnv = resolveEnvironment(readEnv());

  // Sumsub app tokens are prefixed sbx: for sandbox keys and prd: for production.
  const tokenPrefix = appToken.startsWith("sbx:")
    ? "sbx"
    : appToken.startsWith("prd:")
      ? "prd"
      : "unknown";

  const result: Record<string, unknown> = {
    checked_at: new Date().toISOString(),
    platform_environment: platformEnv,
    treated_as_production: envDecision.isProduction,
    sumsub: {
      base_url_host: host,
      base_url_looks_like_sandbox: envDecision.sandboxBaseUrl,
      app_token_prefix: tokenPrefix,
      app_token: mask(appToken),
      secret_key: mask(secretKey),
      webhook_secret: mask(webhookSecret),
      provider_level: providerLevel || null,
      customer_level: customerLevel || null,
    },
    // The decisive rule: in production a sandbox-originated result can never
    // satisfy the identity gate.
    sandbox_results_trusted_for_approval: envDecision.acceptSandbox,
  };

  if (!appToken || !secretKey || !host || host === "invalid_url") {
    result.probes = { skipped: "sumsub_config_incomplete" };
    return json(result, 200);
  }

  // 1) Credential validity. A nonexistent externalUserId returns 404 when the
  //    signature is valid, and 401 when it is not — so the status code alone
  //    distinguishes "bad credentials" from "good credentials, no such user".
  const credProbe = await probe(
    host,
    appToken,
    secretKey,
    "GET",
    "/resources/applicants/-;externalUserId=mycleaner-selftest-nonexistent/one",
  );

  // 2) Level existence, per configured level. Sumsub rejects an unknown
  //    levelName with 400 + "no such level"; a valid level returns a token.
  //    Creating an access token does NOT create an applicant.
  const levelProbes: Record<string, unknown> = {};
  for (const [key, level] of Object.entries({ provider: providerLevel, customer: customerLevel })) {
    if (!level) {
      levelProbes[key] = { configured: false };
      continue;
    }
    const p = await probe(
      host,
      appToken,
      secretKey,
      "POST",
      `/resources/accessTokens?userId=${encodeURIComponent("mycleaner-selftest")}` +
        `&levelName=${encodeURIComponent(level)}&ttlInSecs=60`,
    );
    levelProbes[key] = {
      configured: true,
      level_name: level,
      http_status: p.status,
      level_exists: p.ok,
      note: p.note,
    };
  }

  result.probes = {
    credentials: {
      http_status: credProbe.status,
      credentials_valid: credProbe.status === 404 || credProbe.ok,
      unauthorized: credProbe.status === 401,
      note: credProbe.note,
    },
    levels: levelProbes,
  };

  console.log(JSON.stringify({
    evt: "identity.selftest",
    by: ctx.user.id,
    host,
    token_prefix: tokenPrefix,
    platform_env: platformEnv,
    cred_status: credProbe.status,
  }));

  return json(result, 200);
});
