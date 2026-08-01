import { describe, it, expect } from "vitest";
import { evaluateProviderGate } from "../../supabase/functions/_shared/providerGate.ts";

const base = {
  user_id: "u1",
  provider_id: "P-1",
  status: "active",
  suspended_at: null as string | null,
  rejected_at: null as string | null,
  archived_at: null as string | null,
  approved_at: "2026-01-01T00:00:00Z" as string | null,
};

describe("evaluateProviderGate", () => {
  it("allows an active, approved provider", () => {
    const r = evaluateProviderGate(base);
    expect(r.ok).toBe(true);
    expect(r.provider?.providerId).toBe("P-1");
  });

  it("refuses a missing provider profile (fail-closed)", () => {
    expect(evaluateProviderGate(null)).toMatchObject({ ok: false, reason: "no_provider_profile" });
  });

  it.each(["draft", "pending_identity", "pending_stripe", "pending_review"])(
    "refuses non-active status %s",
    (status) => {
      expect(evaluateProviderGate({ ...base, status })).toMatchObject({
        ok: false,
        reason: "provider_not_active",
      });
    },
  );

  it("refuses a suspended provider even when status still says active", () => {
    expect(
      evaluateProviderGate({ ...base, suspended_at: "2026-02-01T00:00:00Z" }),
    ).toMatchObject({ ok: false, reason: "provider_suspended" });
  });

  it("refuses rejected and archived providers", () => {
    expect(evaluateProviderGate({ ...base, status: "rejected" }).reason).toBe("provider_rejected");
    expect(evaluateProviderGate({ ...base, archived_at: "x" }).reason).toBe("provider_archived");
  });

  it("refuses an active status without approval timestamp", () => {
    expect(evaluateProviderGate({ ...base, approved_at: null })).toMatchObject({
      ok: false,
      reason: "provider_not_active",
    });
  });

  it("refuses paused by default and allows it only when explicitly permitted", () => {
    const paused = { ...base, status: "paused" };
    expect(evaluateProviderGate(paused)).toMatchObject({ ok: false, reason: "provider_paused" });
    expect(evaluateProviderGate(paused, { allowPaused: true }).ok).toBe(true);
  });

  it("never allows suspended even with allowPaused", () => {
    expect(
      evaluateProviderGate({ ...base, status: "suspended" }, { allowPaused: true }).ok,
    ).toBe(false);
  });
});
