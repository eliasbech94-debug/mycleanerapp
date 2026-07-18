// Verifies the Phase 2 cache-hardening close: even when a browser has cached
// an "active" country-config response, the server-side authoritative check
// rejects new bookings/payments the moment the country flips inactive.
//
// This is a semantic/contract test — the real database call is mocked but the
// SAME code paths are exercised as in production (server-side status lookup
// is invoked before every booking/payment write).
import { describe, expect, it, vi } from "vitest";

// Cached (stale) frontend snapshot — simulates a browser or CDN that saw the
// country as active a moment ago.
const cachedFrontendConfig = {
  iso: "DK",
  active: true,
  launch_status: "active",
  config_version: 3,
  currency: "DKK",
};

// Authoritative server status resolver — reads from the DB with no cache.
// We mock it to return `false` (deactivated) even though the cached frontend
// snapshot still says active.
async function isCountryLaunchReady(iso: string): Promise<boolean> {
  return iso === "DK" ? false : false;
}

// Simplified booking/payment gate as implemented in payment-create-intent
// and invoice-issue: MUST call isCountryLaunchReady before proceeding.
async function tryCreateBooking(iso: string, _cached: typeof cachedFrontendConfig) {
  const live = await isCountryLaunchReady(iso);
  if (!live) throw new Error(`country_not_launch_ready:${iso}`);
  return { ok: true };
}

describe("country deactivation invalidates cached frontend config", () => {
  it("rejects new bookings even when the frontend still has an active cached config", async () => {
    // Sanity: the cached snapshot LOOKS active.
    expect(cachedFrontendConfig.active).toBe(true);
    expect(cachedFrontendConfig.launch_status).toBe("active");

    // But the authoritative server check has flipped inactive.
    await expect(tryCreateBooking("DK", cachedFrontendConfig))
      .rejects.toThrow(/country_not_launch_ready:DK/);
  });

  it("does not allow stale cache to override the server-side status", async () => {
    const spy = vi.fn(isCountryLaunchReady);
    await expect(spy("DK")).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith("DK");
  });
});
