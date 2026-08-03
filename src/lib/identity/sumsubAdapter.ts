/**
 * Sumsub adapter stub (Stage 1).
 *
 * DO NOT INSTANTIATE FROM CLIENT CODE. Server-only.
 *
 * Real HTTP calls land in Stage 2. This module only:
 *  - Reads config from environment (never hardcoded).
 *  - Exposes the shape that satisfies IdentityProviderAdapter.
 *  - Throws NotImplemented for network methods so accidental use fails loudly.
 *
 * Expected environment variables (configured via Cloud secrets, NOT in code):
 *   SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_WEBHOOK_SECRET,
 *   SUMSUB_BASE_URL, SUMSUB_PROVIDER_LEVEL, SUMSUB_CUSTOMER_LEVEL
 */
import type {
  IdentityProviderAdapter,
  AccessToken,
  AccessTokenRequest,
  CreateApplicantInput,
  IdentitySummary,
  WebhookVerification,
} from "./adapter";
import { verifySumsubWebhookSignature } from "./signing";

export interface SumsubConfig {
  appToken: string;
  secretKey: string;
  webhookSecret: string;
  baseUrl: string;              // e.g. https://api.sumsub.com
  providerLevel: string;        // e.g. "id-and-liveness" (ID document + liveness)
  customerLevel: string;        // e.g. "id-only" (ID document only)

}

export function loadSumsubConfigFromEnv(
  env: Record<string, string | undefined>,
): SumsubConfig | null {
  const cfg = {
    appToken: env.SUMSUB_APP_TOKEN,
    secretKey: env.SUMSUB_SECRET_KEY,
    webhookSecret: env.SUMSUB_WEBHOOK_SECRET,
    baseUrl: env.SUMSUB_BASE_URL,
    providerLevel: env.SUMSUB_PROVIDER_LEVEL,
    customerLevel: env.SUMSUB_CUSTOMER_LEVEL,
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return null;
  return cfg as SumsubConfig;
}

class NotImplemented extends Error {
  constructor(method: string) {
    super(`sumsub.${method}: not implemented in Stage 1 — identity verification is disabled`);
    this.name = "NotImplemented";
  }
}

export class SumsubAdapter implements IdentityProviderAdapter {
  readonly providerId = "sumsub" as const;
  constructor(private readonly cfg: SumsubConfig) {}

  createApplicant(_input: CreateApplicantInput): Promise<{ externalRef: string }> {
    throw new NotImplemented("createApplicant");
  }
  getApplicantStatus(_externalRef: string): Promise<IdentitySummary> {
    throw new NotImplemented("getApplicantStatus");
  }
  issueAccessToken(_input: AccessTokenRequest): Promise<AccessToken> {
    throw new NotImplemented("issueAccessToken");
  }

  /** Webhook verification IS wired up so signature checks can be tested. */
  async verifyWebhook(
    rawBody: string | Uint8Array,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookVerification> {
    const digest = headers["x-payload-digest"] ?? headers["X-Payload-Digest"];
    const ok = await verifySumsubWebhookSignature({
      webhookSecret: this.cfg.webhookSecret,
      rawBody,
      headerDigest: digest,
    });
    if (!ok) return { ok: false, eventId: null, eventType: null, reason: "signature_invalid" };

    try {
      const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
      const parsed = JSON.parse(text) as { applicantId?: string; type?: string };
      return {
        ok: true,
        // Sumsub does not send a stable event id; caller composes one from
        // applicantId + type + payload hash. We surface what we have.
        eventId: parsed.applicantId ?? null,
        eventType: parsed.type ?? null,
      };
    } catch {
      return { ok: false, eventId: null, eventType: null, reason: "invalid_json" };
    }
  }
}
