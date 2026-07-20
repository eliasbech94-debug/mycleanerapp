/**
 * Identity verification provider adapter (Stage 1 scaffolding).
 *
 * Runtime is DISABLED — see feature flag `identity.enabled` (default OFF).
 * No adapter method should be called from user flows until Stage 2.
 *
 * Contract goals:
 *  - Vendor-agnostic. Sumsub is one implementation; we can swap Onfido / Veriff
 *    without touching call sites.
 *  - Never returns raw ID docs, selfies or biometric payloads. Only status
 *    metadata + a short-lived access token that the WebSDK consumes.
 */

export type IdentityLevel = "customer" | "provider";

export type IdentityStatus =
  | "unverified"
  | "pending"
  | "approved"
  | "rejected"
  | "on_hold"
  | "expired";

export interface IdentitySummary {
  identityId: string;             // internal person_identities.id
  externalRef: string | null;     // provider applicantId
  status: IdentityStatus;
  level: IdentityLevel | null;
  countryCode: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
}

export interface CreateApplicantInput {
  identityId: string;
  level: IdentityLevel;
  countryCode: string;
}

export interface AccessTokenRequest {
  identityId: string;
  level: IdentityLevel;
  ttlSeconds?: number;
}

export interface AccessToken {
  token: string;
  userId: string;       // external ref echoed by provider
  expiresAt: string;    // ISO
}

export interface WebhookVerification {
  ok: boolean;
  eventId: string | null;
  eventType: string | null;
  reason?: string;
}

/**
 * Adapter interface. Implementations are server-side ONLY (edge functions).
 * Never import a concrete adapter into client bundles.
 */
export interface IdentityProviderAdapter {
  readonly providerId: "sumsub";

  createApplicant(input: CreateApplicantInput): Promise<{ externalRef: string }>;

  getApplicantStatus(externalRef: string): Promise<IdentitySummary>;

  issueAccessToken(input: AccessTokenRequest): Promise<AccessToken>;

  verifyWebhook(
    rawBody: string | Uint8Array,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookVerification>;
}
