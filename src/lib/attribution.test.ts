import { describe, expect, it, vi } from "vitest";
import { resolveAcquisition, type SlugLookup } from "./attribution";

const QUOTE_PROVIDER = "user-authoritative-1";
const OTHER_PROVIDER = "user-other-2";

function lookup(map: Record<string, string>): SlugLookup {
  return async (slug: string) => (map[slug] ? { user_id: map[slug] } : null);
}

describe("resolveAcquisition — server-side attribution", () => {
  it("stamps acquisition fields when slug matches the quote's provider", async () => {
    const res = await resolveAcquisition({
      source: "provider_direct_link",
      providerSlug: "anna-clean",
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: lookup({ "anna-clean": QUOTE_PROVIDER }),
    });
    expect(res).toEqual({
      acquisitionSource: "provider_direct_link",
      acquisitionProviderId: QUOTE_PROVIDER,
    });
  });

  it("promotes bare 'marketplace' to 'provider_direct_link' when slug matches quote", async () => {
    const res = await resolveAcquisition({
      source: "marketplace",
      providerSlug: "anna-clean",
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: lookup({ "anna-clean": QUOTE_PROVIDER }),
    });
    expect(res.acquisitionSource).toBe("provider_direct_link");
    expect(res.acquisitionProviderId).toBe(QUOTE_PROVIDER);
  });

  it("downgrades to 'marketplace' when slug resolves to a DIFFERENT provider than the quote", async () => {
    const spy = vi.fn(lookup({ "someone-else": OTHER_PROVIDER }));
    const res = await resolveAcquisition({
      source: "provider_social_share",
      providerSlug: "someone-else",
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: spy,
    });
    expect(res).toEqual({ acquisitionSource: "marketplace", acquisitionProviderId: null });
    expect(spy).toHaveBeenCalledWith("someone-else");
  });

  it("downgrades to 'marketplace' when slug does not resolve at all", async () => {
    const res = await resolveAcquisition({
      source: "provider_qr",
      providerSlug: "does-not-exist",
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: lookup({}),
    });
    expect(res).toEqual({ acquisitionSource: "marketplace", acquisitionProviderId: null });
  });

  it("ignores client-supplied provider-channel source when no slug is provided", async () => {
    const res = await resolveAcquisition({
      source: "provider_direct_link",
      providerSlug: null,
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: lookup({}),
    });
    expect(res).toEqual({ acquisitionSource: "marketplace", acquisitionProviderId: null });
  });

  it("leaves a plain 'marketplace' booking unchanged when no slug and no lock", async () => {
    const res = await resolveAcquisition({
      source: "marketplace",
      providerSlug: null,
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: lookup({}),
    });
    expect(res).toEqual({ acquisitionSource: "marketplace", acquisitionProviderId: null });
  });

  it("client cannot inject an arbitrary provider id — only slugLookup(user_id) is trusted", async () => {
    // Even if the client somehow smuggled in a slug that maps to another
    // provider, the resolver ignores it because the quote provider wins.
    const res = await resolveAcquisition({
      source: "provider_direct_link",
      providerSlug: "attacker-slug",
      quoteProviderUserId: QUOTE_PROVIDER,
      slugLookup: lookup({ "attacker-slug": OTHER_PROVIDER }),
    });
    expect(res.acquisitionProviderId).not.toBe(OTHER_PROVIDER);
    expect(res.acquisitionProviderId).toBeNull();
    expect(res.acquisitionSource).toBe("marketplace");
  });
});
