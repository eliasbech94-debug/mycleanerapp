// Pure logic tests for the identity webhook helpers.
// The edge function itself talks to Sumsub + Supabase, but the security-critical
// primitives (signature check, event-id composition, replay window, status map)
// live in reusable helpers and are exercised here in Vitest.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
const WEBHOOK_MAX_PAST_MS = 48 * 60 * 60_000;
const WEBHOOK_MAX_FUTURE_MS = 10 * 60_000;
function isReplay(
  createdAtMs: number | undefined,
  nowMs: number,
  maxPastMs = WEBHOOK_MAX_PAST_MS,
  maxFutureMs = WEBHOOK_MAX_FUTURE_MS,
): boolean {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return false;
  const delta = nowMs - createdAtMs;
  if (delta >= 0) return delta > maxPastMs;
  return -delta > maxFutureMs;
}
function mapSumsubStatus(
  reviewStatus: string | undefined,
  reviewAnswer: string | undefined,
  reviewRejectType?: string | undefined,
) {
  const s = (reviewStatus ?? "").toLowerCase();
  const a = (reviewAnswer ?? "").toUpperCase();
  const rt = (reviewRejectType ?? "").toUpperCase();
  if (s === "onhold") return "on_hold";
  if (["init", "prechecked", "queued", "pending"].includes(s)) return "pending";
  if (s === "completed") {
    if (a === "GREEN") return "approved";
    if (a === "RED") return rt === "RETRY" ? "pending" : "rejected";
  }
  return "pending";
}
function isSandboxAppToken(appToken: string | null | undefined): boolean {
  return (appToken ?? "").toLowerCase().startsWith("sbx:");
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

describe("webhook freshness window", () => {
  const now = 1_700_000_000_000;
  const hours = (n: number) => n * 60 * 60_000;

  it("accepts recent events", () => {
    expect(isReplay(now - 4 * 60_000, now)).toBe(false);
    expect(isReplay(now + 4 * 60_000, now)).toBe(false);
  });

  // Regression: a 5-minute past window silently discarded Sumsub's own
  // exponential-backoff retries, permanently losing approval events.
  it("accepts a Sumsub retry delivered hours later", () => {
    expect(isReplay(now - hours(1), now)).toBe(false);
    expect(isReplay(now - hours(12), now)).toBe(false);
    expect(isReplay(now - hours(47), now)).toBe(false);
  });

  it("rejects events older than the 48h budget", () => {
    expect(isReplay(now - hours(49), now)).toBe(true);
  });

  it("still rejects future timestamps beyond 10 minutes (skew or forgery)", () => {
    expect(isReplay(now + 11 * 60_000, now)).toBe(true);
    expect(isReplay(now + hours(1), now)).toBe(true);
  });

  it("does not reject when createdAtMs is missing (falls through to idempotency)", () => {
    expect(isReplay(undefined, now)).toBe(false);
  });
});

describe("idempotency: duplicate deliveries never re-apply state", () => {
  // Mirrors the guard in identity-webhook/index.ts. The bug: the handler
  // rewrote the row's result from "processed" to "duplicate", so a THIRD
  // delivery no longer matched "processed" and re-applied the state change.
  const alreadyHandled = (result: string | undefined) =>
    result === "processed" || result === "duplicate";

  it("treats the second delivery as a duplicate", () => {
    expect(alreadyHandled("processed")).toBe(true);
  });

  it("treats a third delivery as a duplicate even after a legacy 'duplicate' row", () => {
    expect(alreadyHandled("duplicate")).toBe(true);
  });

  it("still processes rows that never completed", () => {
    for (const r of ["received", "failed", "signature_invalid", undefined]) {
      expect(alreadyHandled(r)).toBe(false);
    }
  });
});

describe("sandbox credential detection", () => {
  // Sumsub serves sandbox and production from the same api.sumsub.com host,
  // so the app-token prefix is the only reliable environment signal.
  it("flags sbx: tokens as sandbox even on the production host", () => {
    expect(isSandboxAppToken("sbx:AbC123.xyz")).toBe(true);
  });
  it("does not flag prd: tokens", () => {
    expect(isSandboxAppToken("prd:AbC123.xyz")).toBe(false);
  });
  it("treats a missing token as non-sandbox (other guards fail closed)", () => {
    expect(isSandboxAppToken(undefined)).toBe(false);
    expect(isSandboxAppToken("")).toBe(false);
  });
});

describe("Sumsub -> internal status mapping", () => {
  it("approved when reviewStatus=completed & reviewAnswer=GREEN", () => {
    expect(mapSumsubStatus("completed", "GREEN")).toBe("approved");
  });
  it("rejected when reviewStatus=completed & reviewAnswer=RED with FINAL reject type", () => {
    expect(mapSumsubStatus("completed", "RED", "FINAL")).toBe("rejected");
  });

  // RED+RETRY means "resubmit better documents", not "you are refused".
  it("pending (resubmission) when reviewAnswer=RED & reviewRejectType=RETRY", () => {
    expect(mapSumsubStatus("completed", "RED", "RETRY")).toBe("pending");
    expect(mapSumsubStatus("completed", "RED", "retry")).toBe("pending");
  });

  it("treats RED without a reject type as terminal (fail closed)", () => {
    expect(mapSumsubStatus("completed", "RED")).toBe("rejected");
  });

  it("never approves on a RETRY reject type", () => {
    expect(mapSumsubStatus("completed", "RED", "RETRY")).not.toBe("approved");
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

// The helpers above are hand-mirrored from the Deno edge modules (Vitest cannot
// import `npm:` specifiers). Assert the real source still agrees, so a change on
// one side cannot silently invalidate these tests.
describe("edge/test mirror drift guard", () => {
  const sumsubSrc = readFileSync("supabase/functions/_shared/sumsub.ts", "utf8");
  const envSrc = readFileSync("supabase/functions/_shared/sumsubEnv.ts", "utf8");
  const webhookSrc = readFileSync("supabase/functions/identity-webhook/index.ts", "utf8");

  it("edge freshness window matches the mirrored constants", () => {
    expect(sumsubSrc).toContain("WEBHOOK_MAX_PAST_MS = 48 * 60 * 60_000");
    expect(sumsubSrc).toContain("WEBHOOK_MAX_FUTURE_MS = 10 * 60_000");
  });

  it("edge status map honours the RETRY reject type", () => {
    expect(sumsubSrc).toContain('rt === "RETRY" ? "pending" : "rejected"');
  });

  it("edge webhook passes reviewRejectType into the status map", () => {
    expect(webhookSrc).toContain("parsed.reviewResult?.reviewRejectType,");
  });

  it("edge sandbox detection inspects the app-token prefix", () => {
    expect(envSrc).toContain('startsWith("sbx:")');
    expect(envSrc).toContain("isSandboxAppToken(appToken)");
  });

  it("edge webhook keeps the processed marker sticky", () => {
    expect(webhookSrc).toContain(
      'existing.result === "processed" || existing.result === "duplicate"',
    );
  });
});
