import { describe, expect, it } from "vitest";
import {
  COOKIE_CONSENT_VERSION,
  createCookieConsent,
  parseStoredConsent,
} from "./CookieConsent";

describe("cookie consent preferences", () => {
  it("defaults optional cookie categories to off", () => {
    const consent = createCookieConsent(false, false, "2026-07-29T10:00:00.000Z");

    expect(consent).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
      version: COOKIE_CONSENT_VERSION,
      updatedAt: "2026-07-29T10:00:00.000Z",
    });
  });

  it("round-trips valid stored consent", () => {
    const consent = createCookieConsent(true, false, "2026-07-29T10:00:00.000Z");

    expect(parseStoredConsent(JSON.stringify(consent))).toEqual(consent);
  });

  it.each([
    null,
    "",
    "{not-json",
    JSON.stringify({ version: 0, necessary: true, analytics: false, marketing: false }),
    JSON.stringify({ version: 1, necessary: false, analytics: false, marketing: false }),
    JSON.stringify({ version: 1, necessary: true, analytics: "yes", marketing: false }),
  ])("rejects missing or invalid stored consent", (value) => {
    expect(parseStoredConsent(value)).toBeNull();
  });
});
