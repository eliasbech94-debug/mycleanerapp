/**
 * Sumsub HMAC signing utility.
 *
 * Sumsub authenticates REST calls with these headers:
 *   X-App-Token       = <SUMSUB_APP_TOKEN>
 *   X-App-Access-Ts   = <unix seconds>
 *   X-App-Access-Sig  = HMAC_SHA256(secret, ts + METHOD + path + body)
 *
 * Webhooks are signed with:
 *   X-Payload-Digest  = HMAC_SHA256(webhookSecret, rawBody)
 *
 * Uses the platform Web Crypto API — works in browser, Node 18+ and Deno,
 * so the same module is unit-tested in Vitest and re-imported by edge fns.
 */

const enc = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = typeof message === "string" ? enc.encode(message) : message;
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SignedRequestHeaders {
  "X-App-Token": string;
  "X-App-Access-Ts": string;
  "X-App-Access-Sig": string;
}

export interface SignRequestInput {
  appToken: string;
  secretKey: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;              // starts with '/', includes query string
  body?: string;             // raw JSON string, empty for GET/DELETE
  timestampSec?: number;     // overridable for tests
}

export async function signSumsubRequest(input: SignRequestInput): Promise<SignedRequestHeaders> {
  const ts = (input.timestampSec ?? Math.floor(Date.now() / 1000)).toString();
  const payload = ts + input.method.toUpperCase() + input.path + (input.body ?? "");
  const sig = await hmacSha256Hex(input.secretKey, payload);
  return {
    "X-App-Token": input.appToken,
    "X-App-Access-Ts": ts,
    "X-App-Access-Sig": sig,
  };
}

/** Constant-time hex compare. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySumsubWebhookSignature(input: {
  webhookSecret: string;
  rawBody: string | Uint8Array;
  headerDigest: string | undefined | null;
}): Promise<boolean> {
  if (!input.headerDigest) return false;
  const expected = await hmacSha256Hex(input.webhookSecret, input.rawBody);
  return timingSafeEqualHex(expected.toLowerCase(), input.headerDigest.toLowerCase());
}

// Internal export for tests only.
export const __internal = { hmacSha256Hex, timingSafeEqualHex };
