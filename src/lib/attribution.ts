/**
 * Pure attribution resolver used by the checkout edge function
 * (`supabase/functions/payment-create-intent/index.ts`). Kept as a pure module
 * so the algorithm can be unit-tested from vitest without spinning up Deno.
 *
 * Rules — enforced server-side, never trusted from the client:
 *   1. The provider identity is ALWAYS the one on the locked pricing quote.
 *      Client-supplied slugs/sources never override it.
 *   2. If a slug is supplied and resolves to the same user_id as the quote's
 *      provider, we stamp `acquisition_provider_id` with that user_id and
 *      normalise `marketplace` → `provider_direct_link`.
 *   3. If the slug is missing OR resolves to a different provider, we discard
 *      acquisition metadata and downgrade the source to `marketplace`.
 *   4. If the source claims a provider channel but no slug is provided, that
 *      claim is untrusted and downgraded to `marketplace`.
 *
 * The edge function contains a near-identical copy of this algorithm; changes
 * here MUST be mirrored there. `src/lib/attribution.test.ts` locks the
 * behaviour.
 */

export const ACQUISITION_SOURCES = [
  "marketplace",
  "provider_direct_link",
  "provider_qr",
  "provider_social_share",
  "provider_embedded_widget",
  "unknown",
] as const;

export type AcquisitionSourceServer = (typeof ACQUISITION_SOURCES)[number];

export type SlugLookup = (slug: string) => Promise<{ user_id: string } | null>;

export interface ResolveAcquisitionInput {
  source?: AcquisitionSourceServer | null;
  providerSlug?: string | null;
  /** The provider user_id derived from the locked pricing quote. */
  quoteProviderUserId: string | null;
  slugLookup: SlugLookup;
}

export interface ResolvedAcquisition {
  acquisitionSource: AcquisitionSourceServer;
  acquisitionProviderId: string | null;
}

export async function resolveAcquisition(
  input: ResolveAcquisitionInput,
): Promise<ResolvedAcquisition> {
  let source: AcquisitionSourceServer = input.source ?? "marketplace";
  let providerId: string | null = null;

  if (input.providerSlug) {
    const row = await input.slugLookup(input.providerSlug);
    const matches =
      !!row?.user_id &&
      !!input.quoteProviderUserId &&
      row.user_id === input.quoteProviderUserId;
    if (matches) {
      providerId = row!.user_id;
      if (source === "marketplace") source = "provider_direct_link";
    } else {
      source = "marketplace";
    }
  } else if (source !== "marketplace") {
    // Source claimed a provider channel but no slug supplied — untrusted.
    source = "marketplace";
  }

  return { acquisitionSource: source, acquisitionProviderId: providerId };
}
