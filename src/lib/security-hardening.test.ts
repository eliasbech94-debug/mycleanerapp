// Automated security tests for Production Hardening Phase 1.
// These assert that anonymous / authenticated clients CANNOT read locked-down
// internal configuration tables and CANNOT execute internal SECURITY DEFINER
// functions. They use the browser-side anon client — RLS is the boundary.
//
// The tests use the project's public anon key (safe to ship in the browser).
// They do not require signing in: an authenticated user still has the
// `authenticated` role, and since none of these policies allow that role to
// SELECT, the queries must return zero rows (or an error), never data.

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const anonClient = createClient(url, anon, { auth: { persistSession: false } });

async function mustBeBlocked(table: string) {
  const { data, error } = await anonClient.from(table as never).select("*").limit(1);
  // RLS blocks either by returning an error OR by returning zero rows silently.
  // Both outcomes are acceptable — the invariant is "no data leaks".
  if (error) {
    expect(error).toBeTruthy();
  } else {
    expect(Array.isArray(data)).toBe(true);
    expect((data ?? []).length).toBe(0);
  }
}

describe("Phase 1 – internal config tables are locked down for anon", () => {
  it("finance_settings is not readable", () => mustBeBlocked("finance_settings"));
  it("platform_tax_settings is not readable", () => mustBeBlocked("platform_tax_settings"));
  it("market_rate_thresholds is not readable", () => mustBeBlocked("market_rate_thresholds"));
  it("feature_flags raw table is not readable", () => mustBeBlocked("feature_flags"));
  // RC1 FP1: country_configs base table must never leak stripe_account_id or
  // internal payment routing to anonymous or authenticated clients.
  it("country_configs base table is not readable by anon", () => mustBeBlocked("country_configs"));
  it("anon cannot select stripe_account_id from country_configs", async () => {
    const { data, error } = await anonClient
      .from("country_configs" as never)
      .select("stripe_account_id")
      .limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect((data ?? []).length).toBe(0);
    }
  });
  it("country_configs_public view exposes safe fields to anon", async () => {
    const { error } = await anonClient
      .from("country_configs_public" as never)
      .select("iso,currency,default_language,timezone")
      .limit(1);
    expect(error).toBeFalsy();
  });
});

describe("Phase 1 – internal SECURITY DEFINER functions reject anon callers", () => {
  it("next_invoice_number is forbidden", async () => {
    const { error } = await anonClient.rpc("next_invoice_number" as never, { _country_code: "DK" });
    expect(error).toBeTruthy();
  });
  it("next_credit_note_number is forbidden", async () => {
    const { error } = await anonClient.rpc("next_credit_note_number" as never, { _country_code: "DK" });
    expect(error).toBeTruthy();
  });
  it("tax_encrypt is forbidden", async () => {
    const { error } = await anonClient.rpc("tax_encrypt" as never, { _plaintext: "x", _key: "y" });
    expect(error).toBeTruthy();
  });
  it("tax_decrypt is forbidden", async () => {
    const { error } = await anonClient.rpc("tax_decrypt" as never, { _ciphertext: "\\x00", _key: "y" });
    expect(error).toBeTruthy();
  });
  it("raise_system_alert is forbidden", async () => {
    const { error } = await anonClient.rpc("raise_system_alert" as never, {
      _alert_key: "test", _severity: "info", _source: "test", _title: "t",
    });
    expect(error).toBeTruthy();
  });
  it("resolve_system_alert is forbidden", async () => {
    const { error } = await anonClient.rpc("resolve_system_alert" as never, { _alert_key: "x" });
    expect(error).toBeTruthy();
  });
  it("is_under_legal_hold is forbidden", async () => {
    const { error } = await anonClient.rpc("is_under_legal_hold" as never, {
      _target_type: "user", _target_id: "x",
    });
    expect(error).toBeTruthy();
  });
});

describe("Phase 1 – public-safe RPCs still work for anon", () => {
  it("evaluate_feature_flag returns a boolean (never throws)", async () => {
    const { data, error } = await anonClient.rpc("evaluate_feature_flag" as never, {
      _flag_key: "__nonexistent_flag_for_test__",
      _user_id: null, _provider_id: null, _country_iso: null,
    });
    expect(error).toBeFalsy();
    expect(typeof data).toBe("boolean");
  });
  it("is_country_visible works", async () => {
    const { error } = await anonClient.rpc("is_country_visible" as never, { _iso: "DK" });
    expect(error).toBeFalsy();
  });
});
