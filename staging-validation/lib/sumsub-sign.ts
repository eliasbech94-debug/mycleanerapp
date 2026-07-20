import { createHmac } from "node:crypto";

/** Sumsub verifies webhook payloads with HMAC-SHA256 over the raw body. */
export function sumsubSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
