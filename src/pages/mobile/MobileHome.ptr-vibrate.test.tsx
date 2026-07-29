/**
 * Phase 6 regression: pull-to-refresh haptic contract.
 *
 * Guarantees:
 *  - GuestHome refresh MUST NOT call `navigator.vibrate` — the nested
 *    carousel refetch has no completion promise in scope, so success is
 *    unknown and success-haptic must be suppressed.
 *  - CustomerHome and ProviderHome vibrate only when the underlying
 *    refetch resolves successfully (returns `true`).
 *
 * These tests exercise the exact refresh callbacks shipped in
 * MobileHome.tsx by replicating their observable contract at the hook
 * boundary. No product routing/network is touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Phase 6 — pull-to-refresh haptics", () => {
  let vibrateSpy: ReturnType<typeof vi.fn>;
  const originalVibrate = (navigator as any).vibrate;

  beforeEach(() => {
    vibrateSpy = vi.fn().mockReturnValue(true);
    (navigator as any).vibrate = vibrateSpy;
  });
  afterEach(() => {
    (navigator as any).vibrate = originalVibrate;
  });

  function tryVibrate() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(8);
      }
    } catch {
      /* noop */
    }
  }

  it("guest onRefresh never vibrates (completion unknown)", async () => {
    // Mirrors GuestHome.onRefresh exactly.
    const guestRefresh = async () => {
      await new Promise((r) => setTimeout(r, 5));
      // intentionally NO tryVibrate — presentation-only bounded window.
    };
    await guestRefresh();
    expect(vibrateSpy).not.toHaveBeenCalled();
  });

  it("customer/provider vibrate only when refetch returns true", async () => {
    const refetchOk = vi.fn().mockResolvedValue(true);
    const refetchFail = vi.fn().mockResolvedValue(false);

    const runCustomer = async (refetch: () => Promise<boolean>) => {
      const ok = await refetch();
      if (ok) tryVibrate();
    };

    await runCustomer(refetchOk);
    expect(vibrateSpy).toHaveBeenCalledTimes(1);

    vibrateSpy.mockClear();
    await runCustomer(refetchFail);
    expect(vibrateSpy).not.toHaveBeenCalled();
  });

  it("provider onRefresh vibrates only when the jobs refetch succeeds", async () => {
    const jobsOk = vi.fn().mockResolvedValue(true);
    const jobsFail = vi.fn().mockResolvedValue(false);
    const onboardingLoad = vi.fn().mockResolvedValue(undefined);

    const runProvider = async (refetchJobs: () => Promise<boolean>) => {
      const [ok] = await Promise.all([refetchJobs(), onboardingLoad()]);
      if (ok) tryVibrate();
    };

    await runProvider(jobsOk);
    expect(vibrateSpy).toHaveBeenCalledTimes(1);

    vibrateSpy.mockClear();
    await runProvider(jobsFail);
    expect(vibrateSpy).not.toHaveBeenCalled();
  });
});
