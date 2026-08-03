/**
 * Environment resolution for MyCleaner edge functions.
 *
 * Fail-closed by design: unless the deployment can be *explicitly* identified as a
 * non-production environment, it is treated as production. This guards
 * SMS_DEV_MODE so verification codes can never leak to clients in production or
 * in an unknown/misconfigured environment.
 */

export type EnvName =
  | "production"
  | "development"
  | "staging"
  | "preview"
  | "test"
  | "local"
  | "unknown";

export interface RawEnv {
  APP_ENVIRONMENT?: string | null;
  APP_ENV?: string | null;
  ENVIRONMENT?: string | null;
  DENO_DEPLOYMENT_ID?: string | null;
  SMS_DEV_MODE?: string | null;
}

const PRODUCTION_VALUES = new Set(["production", "prod", "live"]);

const NON_PRODUCTION_VALUES: Record<string, EnvName> = {
  development: "development",
  dev: "development",
  develop: "development",
  preview: "preview",
  staging: "staging",
  stage: "staging",
  test: "test",
  testing: "test",
  local: "local",
};

/** Environments where dev_code may be returned when SMS_DEV_MODE=true. */
const DEV_CODE_ALLOWED: ReadonlySet<EnvName> = new Set<EnvName>([
  "development",
  "preview",
  "staging",
  "test",
  "local",
]);

/** Environments where it is acceptable to log a verification code. */
const CODE_LOGGING_ALLOWED: ReadonlySet<EnvName> = new Set<EnvName>([
  "development",
  "local",
]);

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Resolve the effective environment name.
 *
 * - Any of APP_ENVIRONMENT / APP_ENV / ENVIRONMENT set to production => production.
 * - Otherwise the first explicitly recognised non-production value wins.
 * - An unrecognised, non-empty value => "unknown" (treated as production).
 * - No signal at all => "unknown" (fail closed), even without DENO_DEPLOYMENT_ID.
 */
export function resolveEnvironment(raw: RawEnv): EnvName {
  const candidates = [raw.APP_ENVIRONMENT, raw.APP_ENV, raw.ENVIRONMENT].map(norm);

  if (candidates.some((c) => PRODUCTION_VALUES.has(c))) return "production";

  const nonEmpty = candidates.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return "unknown";

  // Every explicitly set value must be a recognised non-production value.
  const mapped = nonEmpty.map((c) => NON_PRODUCTION_VALUES[c]);
  if (mapped.some((m) => m === undefined)) return "unknown";

  return mapped[0]!;
}

/** True when the deployment must be treated as production (incl. unknown). */
export function isProductionEnvironment(raw: RawEnv): boolean {
  const env = resolveEnvironment(raw);
  return env === "production" || env === "unknown";
}

/**
 * dev_code may only be returned when SMS_DEV_MODE=true AND the environment is
 * explicitly one of development/dev/preview/staging/test/local.
 */
export function isSmsDevModeEnabled(raw: RawEnv): boolean {
  if (norm(raw.SMS_DEV_MODE) !== "true") return false;
  return DEV_CODE_ALLOWED.has(resolveEnvironment(raw));
}

/**
 * Verification codes may only ever be logged in an explicit local/development
 * environment that is not a hosted Deno deployment.
 */
export function isCodeLoggingAllowed(raw: RawEnv): boolean {
  if (norm(raw.DENO_DEPLOYMENT_ID).length > 0) return false;
  return CODE_LOGGING_ALLOWED.has(resolveEnvironment(raw));
}

/** Read the relevant variables from Deno.env. */
export function readEnv(): RawEnv {
  const get = (k: string) => {
    try {
      return Deno.env.get(k) ?? null;
    } catch {
      return null;
    }
  };
  return {
    APP_ENVIRONMENT: get("APP_ENVIRONMENT"),
    APP_ENV: get("APP_ENV"),
    ENVIRONMENT: get("ENVIRONMENT"),
    DENO_DEPLOYMENT_ID: get("DENO_DEPLOYMENT_ID"),
    SMS_DEV_MODE: get("SMS_DEV_MODE"),
  };
}
