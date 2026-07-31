import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isCodeLoggingAllowed,
  isProductionEnvironment,
  isSmsDevModeEnabled,
  resolveEnvironment,
} from "./env.ts";

Deno.test("production: APP_ENVIRONMENT=production blocks dev_code", () => {
  const raw = { APP_ENVIRONMENT: "production", SMS_DEV_MODE: "true" };
  assertEquals(resolveEnvironment(raw), "production");
  assertEquals(isProductionEnvironment(raw), true);
  assertEquals(isSmsDevModeEnabled(raw), false);
  assertEquals(isCodeLoggingAllowed(raw), false);
});

Deno.test("production: APP_ENV or ENVIRONMENT=prod also blocks dev_code", () => {
  assertEquals(isSmsDevModeEnabled({ APP_ENV: "prod", SMS_DEV_MODE: "true" }), false);
  assertEquals(isSmsDevModeEnabled({ ENVIRONMENT: "PRODUCTION", SMS_DEV_MODE: "true" }), false);
});

Deno.test("production wins over a conflicting non-production value", () => {
  const raw = { APP_ENVIRONMENT: "production", APP_ENV: "development", SMS_DEV_MODE: "true" };
  assertEquals(resolveEnvironment(raw), "production");
  assertEquals(isSmsDevModeEnabled(raw), false);
});

Deno.test("staging: dev_code allowed only with SMS_DEV_MODE=true", () => {
  assertEquals(resolveEnvironment({ APP_ENVIRONMENT: "staging" }), "staging");
  assertEquals(isSmsDevModeEnabled({ APP_ENVIRONMENT: "staging", SMS_DEV_MODE: "true" }), true);
  assertEquals(isSmsDevModeEnabled({ APP_ENVIRONMENT: "staging" }), false);
  assertEquals(isSmsDevModeEnabled({ APP_ENVIRONMENT: "staging", SMS_DEV_MODE: "false" }), false);
  // staging never logs codes
  assertEquals(isCodeLoggingAllowed({ APP_ENVIRONMENT: "staging", SMS_DEV_MODE: "true" }), false);
});

Deno.test("development/preview/test/local allow dev_code with SMS_DEV_MODE=true", () => {
  for (const value of ["development", "dev", "preview", "test", "local"]) {
    assertEquals(
      isSmsDevModeEnabled({ APP_ENVIRONMENT: value, SMS_DEV_MODE: "true" }),
      true,
      `expected dev mode for ${value}`,
    );
  }
});

Deno.test("code logging only in local/development without DENO_DEPLOYMENT_ID", () => {
  assertEquals(isCodeLoggingAllowed({ APP_ENVIRONMENT: "local" }), true);
  assertEquals(isCodeLoggingAllowed({ APP_ENVIRONMENT: "development" }), true);
  assertEquals(
    isCodeLoggingAllowed({ APP_ENVIRONMENT: "development", DENO_DEPLOYMENT_ID: "abc123" }),
    false,
  );
  assertEquals(isCodeLoggingAllowed({ APP_ENVIRONMENT: "preview" }), false);
});

Deno.test("unknown environment fails closed", () => {
  const noSignal = { SMS_DEV_MODE: "true" };
  assertEquals(resolveEnvironment(noSignal), "unknown");
  assertEquals(isProductionEnvironment(noSignal), true);
  assertEquals(isSmsDevModeEnabled(noSignal), false);
  assertEquals(isCodeLoggingAllowed(noSignal), false);

  const garbage = { APP_ENVIRONMENT: "qa-sandbox-42", SMS_DEV_MODE: "true" };
  assertEquals(resolveEnvironment(garbage), "unknown");
  assertEquals(isSmsDevModeEnabled(garbage), false);

  const mixed = { APP_ENVIRONMENT: "staging", APP_ENV: "weird", SMS_DEV_MODE: "true" };
  assertEquals(resolveEnvironment(mixed), "unknown");
  assertEquals(isSmsDevModeEnabled(mixed), false);
});

Deno.test("unknown environment with DENO_DEPLOYMENT_ID stays production-like", () => {
  const raw = { DENO_DEPLOYMENT_ID: "deploy-1", SMS_DEV_MODE: "true" };
  assertEquals(isProductionEnvironment(raw), true);
  assertEquals(isSmsDevModeEnabled(raw), false);
});
