import { describe, it, expect } from "vitest";
import {
  signSumsubRequest,
  verifySumsubWebhookSignature,
  __internal,
} from "./signing";

const SECRET = "test_secret_key";
const APP_TOKEN = "sbx:app-token";

describe("signSumsubRequest", () => {
  it("produces deterministic HMAC-SHA256 headers for a fixed timestamp", async () => {
    const headers = await signSumsubRequest({
      appToken: APP_TOKEN,
      secretKey: SECRET,
      method: "POST",
      path: "/resources/applicants?levelName=basic-kyc",
      body: JSON.stringify({ externalUserId: "abc-123" }),
      timestampSec: 1700000000,
    });
    expect(headers["X-App-Token"]).toBe(APP_TOKEN);
    expect(headers["X-App-Access-Ts"]).toBe("1700000000");
    // Precomputed: HMAC-SHA256(secret, ts + METHOD + path + body)
    const expected = await __internal.hmacSha256Hex(
      SECRET,
      "1700000000" +
        "POST" +
        "/resources/applicants?levelName=basic-kyc" +
        JSON.stringify({ externalUserId: "abc-123" }),
    );
    expect(headers["X-App-Access-Sig"]).toBe(expected);
    expect(headers["X-App-Access-Sig"]).toHaveLength(64); // 32 bytes hex
  });

  it("handles GET with empty body", async () => {
    const h = await signSumsubRequest({
      appToken: APP_TOKEN,
      secretKey: SECRET,
      method: "GET",
      path: "/resources/applicants/abc",
      timestampSec: 1700000001,
    });
    const expected = await __internal.hmacSha256Hex(
      SECRET,
      "1700000001GET/resources/applicants/abc",
    );
    expect(h["X-App-Access-Sig"]).toBe(expected);
  });

  it("changes signature when body changes", async () => {
    const base = { appToken: APP_TOKEN, secretKey: SECRET, method: "POST" as const, path: "/x", timestampSec: 42 };
    const a = await signSumsubRequest({ ...base, body: '{"a":1}' });
    const b = await signSumsubRequest({ ...base, body: '{"a":2}' });
    expect(a["X-App-Access-Sig"]).not.toBe(b["X-App-Access-Sig"]);
  });
});

describe("verifySumsubWebhookSignature", () => {
  const webhookSecret = "whsec_test";
  const body = JSON.stringify({ applicantId: "app_123", type: "applicantReviewed" });

  it("accepts a correctly signed payload", async () => {
    const digest = await __internal.hmacSha256Hex(webhookSecret, body);
    const ok = await verifySumsubWebhookSignature({ webhookSecret, rawBody: body, headerDigest: digest });
    expect(ok).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const digest = await __internal.hmacSha256Hex(webhookSecret, body);
    const ok = await verifySumsubWebhookSignature({
      webhookSecret,
      rawBody: body + " ",
      headerDigest: digest,
    });
    expect(ok).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const digest = await __internal.hmacSha256Hex("other_secret", body);
    const ok = await verifySumsubWebhookSignature({ webhookSecret, rawBody: body, headerDigest: digest });
    expect(ok).toBe(false);
  });

  it("rejects when the header is missing", async () => {
    const ok = await verifySumsubWebhookSignature({ webhookSecret, rawBody: body, headerDigest: null });
    expect(ok).toBe(false);
  });

  it("is case-insensitive on hex", async () => {
    const digest = (await __internal.hmacSha256Hex(webhookSecret, body)).toUpperCase();
    const ok = await verifySumsubWebhookSignature({ webhookSecret, rawBody: body, headerDigest: digest });
    expect(ok).toBe(true);
  });
});

describe("timingSafeEqualHex", () => {
  it("returns false for different lengths", () => {
    expect(__internal.timingSafeEqualHex("aa", "aabb")).toBe(false);
  });
  it("returns true for identical strings", () => {
    expect(__internal.timingSafeEqualHex("deadbeef", "deadbeef")).toBe(true);
  });
});
