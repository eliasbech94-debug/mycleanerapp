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

export function resolveSumsubEnv(
  baseUrl: string | null | undefined = Deno.env.get("SUMSUB_BASE_URL"),
): SumsubEnvDecision {
  const environment = resolveEnvironment(readEnv());
  const isProduction = environment === "production" || environment === "unknown";

  const url = (baseUrl ?? "").toLowerCase();
  const sandboxBaseUrl = SANDBOX_HOST_HINTS.some((h) => url.includes(h));
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
