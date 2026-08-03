// Sumsub environment guard.
// Production must never accept sandbox verification results, and an
// unknown/misconfigured environment is treated as production (fail closed).
import { readEnv, resolveEnvironment } from "./env.ts";

export interface SumsubEnvDecision {
  environment: string;
  isProduction: boolean;
  sandboxBaseUrl: boolean;
  /** true when a sandbox result may be trusted for approval */
  acceptSandbox: boolean;
}

const SANDBOX_HOST_HINTS = ["test-api", "sandbox", "api-test"];

/**
 * Sumsub serves sandbox and production from the SAME host (api.sumsub.com);
 * the environment is selected by the credential, not the URL. App tokens are
 * prefixed `sbx:` for sandbox and `prd:` for production, so the token prefix is
 * the authoritative signal and the host hints are only a secondary fallback.
 * Detecting on URL alone reports a sandbox key against api.sumsub.com as
 * "production", which is exactly the misconfiguration we must catch.
 */
export function isSandboxAppToken(appToken: string | null | undefined): boolean {
  return (appToken ?? "").toLowerCase().startsWith("sbx:");
}

export function resolveSumsubEnv(
  baseUrl: string | null | undefined = Deno.env.get("SUMSUB_BASE_URL"),
  appToken: string | null | undefined = Deno.env.get("SUMSUB_APP_TOKEN"),
): SumsubEnvDecision {
  const environment = resolveEnvironment(readEnv());
  const isProduction = environment === "production" || environment === "unknown";

  const url = (baseUrl ?? "").toLowerCase();
  const sandboxBaseUrl =
    isSandboxAppToken(appToken) || SANDBOX_HOST_HINTS.some((h) => url.includes(h));
  return {
    environment,
    isProduction,
    sandboxBaseUrl,
    acceptSandbox: !isProduction,
  };
}

/**
 * Decide whether a Sumsub review result is usable for provider approval.
 * `sandboxMode` comes from the Sumsub webhook / applicant payload.
 */
export function isSandboxResult(
  sandboxMode: boolean | undefined | null,
  decision = resolveSumsubEnv(),
): boolean {
  if (sandboxMode === true) return true;
  if (decision.sandboxBaseUrl) return true;
  // Unknown provenance in production is treated as sandbox (fail closed).
  if (sandboxMode == null && decision.isProduction) return true;
  return false;
}
