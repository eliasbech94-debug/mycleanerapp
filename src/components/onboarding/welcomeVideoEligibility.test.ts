import { describe, it, expect } from "vitest";
import {
  isWelcomeVideoEligible,
  resolveWelcomeVideoAudience,
  welcomeVideoCtaRoute,
  WELCOME_VIDEO_SIGNUP_WINDOW_MS,
} from "./welcomeVideoEligibility";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("welcome video eligibility", () => {
  it("shows for a brand new signup that has never seen it", () => {
    expect(isWelcomeVideoEligible({ seenAt: null, userCreatedAt: iso(-5_000), now: NOW })).toBe(true);
  });

  it("never shows again once the profile records it as seen (any device)", () => {
    expect(
      isWelcomeVideoEligible({ seenAt: iso(-1_000), userCreatedAt: iso(-5_000), now: NOW }),
    ).toBe(false);
  });

  it("does not show for existing users signing in, even without a seen timestamp", () => {
    expect(
      isWelcomeVideoEligible({ seenAt: null, userCreatedAt: iso(-90 * 24 * 3600 * 1000), now: NOW }),
    ).toBe(false);
  });

  it("stops showing once the signup window elapses", () => {
    expect(
      isWelcomeVideoEligible({ seenAt: null, userCreatedAt: iso(-WELCOME_VIDEO_SIGNUP_WINDOW_MS + 1000), now: NOW }),
    ).toBe(true);
    expect(
      isWelcomeVideoEligible({ seenAt: null, userCreatedAt: iso(-WELCOME_VIDEO_SIGNUP_WINDOW_MS - 1000), now: NOW }),
    ).toBe(false);
  });

  it("survives a refresh within the window (still eligible until marked seen)", () => {
    expect(isWelcomeVideoEligible({ seenAt: null, userCreatedAt: iso(-60_000), now: NOW })).toBe(true);
    // after being marked seen by the RPC
    expect(isWelcomeVideoEligible({ seenAt: iso(-30_000), userCreatedAt: iso(-60_000), now: NOW })).toBe(false);
  });

  it("handles missing/invalid timestamps defensively", () => {
    expect(isWelcomeVideoEligible({ seenAt: null, userCreatedAt: null, now: NOW })).toBe(false);
    expect(isWelcomeVideoEligible({ seenAt: null, userCreatedAt: "not-a-date", now: NOW })).toBe(false);
    expect(isWelcomeVideoEligible({ seenAt: null, userCreatedAt: iso(10 * 60_000), now: NOW })).toBe(false);
  });
});

describe("audience and CTA routing", () => {
  it("picks provider copy for providers", () => {
    expect(resolveWelcomeVideoAudience(["provider"])).toBe("provider");
    expect(resolveWelcomeVideoAudience(["customer"])).toBe("customer");
    expect(resolveWelcomeVideoAudience([])).toBe("customer");
  });

  it("routes each audience to an existing route", () => {
    expect(welcomeVideoCtaRoute("customer")).toBe("/find-cleaner");
    expect(welcomeVideoCtaRoute("provider")).toBe("/bliv-cleaner");
  });
});
