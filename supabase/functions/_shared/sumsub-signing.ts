// Sumsub HMAC signing (edge-runtime copy).
// Mirrors src/lib/identity/signing.ts — kept as a self-contained copy because
// the Supabase edge bundler cannot resolve imports outside `supabase/`.
const enc = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string | Uint8Array): Promise<string> {
  const keyBytes = enc.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const dataView = typeof message === "string" ? enc.encode(message) : message;
  const dataBuf = dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength) as ArrayBuffer;
  const sig = await crypto.subtle.sign("HMAC", key, dataBuf);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  path: string;
  body?: string;
  timestampSec?: number;
}

export async function signSumsubRequest(input: SignRequestInput): Promise<SignedRequestHeaders> {
  const ts = (input.timestampSec ?? Math.floor(Date.now() / 1000)).toString();
  const payload = ts + input.method.toUpperCase() + input.path + (input.body ?? "");
  const sig = await hmacSha256Hex(input.secretKey, payload);
  return { "X-App-Token": input.appToken, "X-App-Access-Ts": ts, "X-App-Access-Sig": sig };
}

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
