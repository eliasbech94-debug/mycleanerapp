// Deno test file (run with `deno test`). Pure rule verification for the
// server-side provider activation gate.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateProviderGate } from "./providerGate.ts";

const base = {
  user_id: "u1",
  provider_id: "P-1",
  status: "active",
  suspended_at: null as string | null,
  rejected_at: null as string | null,
  archived_at: null as string | null,
  approved_at: "2026-01-01T00:00:00Z" as string | null,
};

Deno.test("active approved provider passes", () => {
  const r = evaluateProviderGate(base);
  assertEquals(r.ok, true);
  assertEquals(r.provider?.providerId, "P-1");
});

Deno.test("missing provider profile is refused (fail-closed)", () => {
  assertEquals(evaluateProviderGate(null).reason, "no_provider_profile");
});

Deno.test("pending statuses are refused", () => {
  for (const status of ["draft", "pending_identity", "pending_stripe", "pending_review"]) {
    const r = evaluateProviderGate({ ...base, status });
    assertEquals(r.ok, false);
    assertEquals(r.reason, "provider_not_active");
  }
});

Deno.test("suspended is refused even when status says active", () => {
  assertEquals(
    evaluateProviderGate({ ...base, suspended_at: "2026-02-01T00:00:00Z" }).reason,
    "provider_suspended",
  );
});

Deno.test("rejected and archived are refused", () => {
  assertEquals(evaluateProviderGate({ ...base, status: "rejected" }).reason, "provider_rejected");
  assertEquals(evaluateProviderGate({ ...base, archived_at: "x" }).reason, "provider_archived");
});

Deno.test("active without approval timestamp is refused", () => {
  assertEquals(evaluateProviderGate({ ...base, approved_at: null }).ok, false);
});

Deno.test("paused refused by default, allowed only when opted in", () => {
  const paused = { ...base, status: "paused" };
  assertEquals(evaluateProviderGate(paused).reason, "provider_paused");
  assertEquals(evaluateProviderGate(paused, { allowPaused: true }).ok, true);
});

Deno.test("allowPaused never unlocks suspended providers", () => {
  assertEquals(
    evaluateProviderGate({ ...base, status: "suspended" }, { allowPaused: true }).ok,
    false,
  );
});
