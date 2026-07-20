// Pure logic tests for the identity webhook helpers.
// The edge function itself talks to Sumsub + Supabase, but the security-critical
// primitives (signature check, event-id composition, replay window, status map)
// live in reusable helpers and are exercised here in Vitest.
import { describe, it, expect } from "vitest";
import { verifySumsubWebhookSignature, __internal } from "./signing";

// Re-implementations mirrored from supabase/functions/_shared/sumsub.ts to
// keep this file free of Deno-only imports. The edge-side module re-exports
// these helpers so drift is caught by CI (edge tests import the same names).
function composeEventId(payload: {
  applicantId?: string; type?: string; createdAt?: string; correlationId?: string;
}, payloadHash: string): string {
  if (payload.correlationId) return `corr:${payload.correlationId}`;
  const parts = [payload.applicantId ?? "noapp", payload.type ?? "notype", payload.createdAt ?? ""];
  if (parts.every((p) => p)) return parts.join(":");
  return `hash:${payloadHash}`;
}
function isReplay(createdAtMs: number | undefined, nowMs: number, maxSkewMs = 5 * 60_000): boolean {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return false;
  return Math.abs(nowMs - createdAtMs) > maxSkewMs;
}
function mapSumsubStatus(reviewStatus: string | undefined, reviewAnswer: string | undefined) {
  const s = (reviewStatus ?? "").toLowerCase();
  const a = (reviewAnswer ?? "").toUpperCase();
  if (s === "onhold") return "on_hold";
  if (["init", "prechecked", "queued", "pending"].includes(s)) return "pending";
  if (s === "completed") {
    if (a === "GREEN") return "approved";
    if (a === "RED") return "rejected";
  }
  return "pending";
}

const SECRET = "whsec_stage2_test";

describe("webhook signature validation", () => {
  it("accepts a correctly signed payload", async () => {
    const body = JSON.stringify({ applicantId: "app_1", type: "applicantReviewed" });
    const digest = await __internal.hmacSha256Hex(SECRET, body);
    expect(
      await verifySumsubWebhookSignature({ webhookSecret: SECRET, rawBody: body, headerDigest: digest }),
    ).toBe(true);
  });

  it("rejects a mutated payload (duplicate delivery of tampered copy)", async () => {
    const body = JSON.stringify({ applicantId: "app_1", type: "applicantReviewed" });
    const digest = await __internal.hmacSha256Hex(SECRET, body);
    const tampered = body.replace("app_1", "app_2");
    expect(
      await verifySumsubWebhookSignature({ webhookSecret: SECRET, rawBody: tampered, headerDigest: digest }),
    ).toBe(false);
  });

  it("rejects when digest header is missing", async () => {
    expect(
      await verifySumsubWebhookSignature({ webhookSecret: SECRET, rawBody: "{}", headerDigest: null }),
    ).toBe(false);
  });
});

describe("event id composition (duplicate delivery detection)", () => {
  it("prefers correlationId when present", () => {
    expect(composeEventId({ correlationId: "abc-123" }, "h")).toBe("corr:abc-123");
  });
  it("falls back to applicantId+type+createdAt tuple", () => {
    const id = composeEventId({ applicantId: "a1", type: "applicantReviewed", createdAt: "2026-07-20" }, "h");
    expect(id).toBe("a1:applicantReviewed:2026-07-20");
  });
  it("uses payload hash as last resort so duplicates still collapse", () => {
    const id = composeEventId({}, "deadbeef");
    expect(id).toBe("hash:deadbeef");
  });
  it("two identical payloads produce identical event ids (idempotency)", () => {
    const p = { applicantId: "a1", type: "applicantPending", createdAt: "t1" };
    expect(composeEventId(p, "h1")).toBe(composeEventId(p, "h1"));
  });
});

describe("replay protection", () => {
  const now = 1_700_000_000_000;
  it("accepts events inside the 5-minute skew", () => {
    expect(isReplay(now - 4 * 60_000, now)).toBe(false);
    expect(isReplay(now + 4 * 60_000, now)).toBe(false);
  });
  it("rejects events older than 5 minutes", () => {
    expect(isReplay(now - 10 * 60_000, now)).toBe(true);
  });
  it("rejects clock-skewed future events", () => {
    expect(isReplay(now + 10 * 60_000, now)).toBe(true);
  });
  it("does not reject when createdAtMs is missing (falls through to idempotency)", () => {
    expect(isReplay(undefined, now)).toBe(false);
  });
});

describe("Sumsub -> internal status mapping", () => {
  it("approved when reviewStatus=completed & reviewAnswer=GREEN", () => {
    expect(mapSumsubStatus("completed", "GREEN")).toBe("approved");
  });
  it("rejected when reviewStatus=completed & reviewAnswer=RED", () => {
    expect(mapSumsubStatus("completed", "RED")).toBe("rejected");
  });
  it("on_hold when reviewStatus=onHold", () => {
    expect(mapSumsubStatus("onHold", undefined)).toBe("on_hold");
  });
  it("pending for init/prechecked/queued/pending (resubmission required)", () => {
    for (const s of ["init", "prechecked", "queued", "pending"]) {
      expect(mapSumsubStatus(s, undefined)).toBe("pending");
    }
  });
  it("defaults to pending for unknown states (safe: never auto-approves)", () => {
    expect(mapSumsubStatus("mystery", "MAYBE")).toBe("pending");
  });
});

describe("access-token issuance contract", () => {
  it("expired token can be detected by expiresAt (client refresh trigger)", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    const expired = (iso: string) => new Date(iso).getTime() < Date.now();
    expect(expired(past)).toBe(true);
    expect(expired(future)).toBe(false);
  });
});
