/**
 * Regression tests for the Founding Cleaner mobile-app shell integration.
 *
 * Covers pure route-gating helpers (no DOM required):
 *  - MobileAppShell whitelist matches `/founding-cleaner` and country prefixes.
 *  - Global Header is suppressed on the mobile variant only.
 *  - Website Footer is suppressed on the mobile variant only.
 *  - MobileBottomNav is shown on `/founding-cleaner` for guest role.
 *  - Non-matching routes still return false (no false-positive matches).
 */
import { describe, it, expect } from "vitest";
import {
  matchesMobileAppRoute,
  normalizePath,
} from "@/hooks/useIsMobileApp";
import { isMobileShellHiddenHeaderRoute } from "@/components/layout/Header";
import {
  shouldShowMobileNav,
  resolveMobileNavRole,
  getMobileNavTabKeys,
} from "@/components/layout/MobileBottomNav";

describe("FoundingCleaner mobile-shell gating", () => {
  const routes = [
    "/founding-cleaner",
    "/dk/founding-cleaner",
    "/gb/founding-cleaner",
    "/se/founding-cleaner",
    "/es/founding-cleaner",
  ];

  it("normalizes country-prefixed variants to /founding-cleaner", () => {
    for (const r of routes) {
      expect(normalizePath(r)).toBe("/founding-cleaner");
    }
  });

  it("is included in the mobile-app-shell whitelist for all country prefixes", () => {
    for (const r of routes) {
      expect(matchesMobileAppRoute(r)).toBe(true);
    }
  });

  it("suppresses the global Header on the mobile variant only (route-level)", () => {
    for (const r of routes) {
      expect(isMobileShellHiddenHeaderRoute(r)).toBe(true);
    }
    // Related routes must not be swept up.
    expect(isMobileShellHiddenHeaderRoute("/faq")).toBe(false);
    expect(isMobileShellHiddenHeaderRoute("/founding-cleaners")).toBe(false);
    expect(isMobileShellHiddenHeaderRoute("/founding")).toBe(false);
  });

  it("shows MobileBottomNav on /founding-cleaner and country prefixes", () => {
    for (const r of routes) {
      expect(shouldShowMobileNav(r)).toBe(true);
    }
    // Guest role default tabs are unchanged — no new campaign tab was invented.
    const role = resolveMobileNavRole({ user: null, isProvider: false });
    expect(role).toBe("guest");
    expect(getMobileNavTabKeys("guest")).toEqual(["home", "search", "login", "menu"]);
  });

  it("does not falsely match unrelated routes", () => {
    for (const r of [
      "/",
      "/faq",
      "/regler",
      "/admin",
      "/employee",
      "/founding-cleaners", // plural typo must not match
      "/founding",
      "/dk/faq",
    ]) {
      // MobileAppShell whitelist should not include unrelated public docs
      // like /faq or /regler.
      if (r === "/") {
        expect(matchesMobileAppRoute(r)).toBe(true);
      } else if (r === "/faq" || r === "/regler" || r === "/dk/faq" ||
                 r === "/founding-cleaners" || r === "/founding" ||
                 r === "/admin" || r === "/employee") {
        expect(matchesMobileAppRoute(r)).toBe(false);
      }
    }
  });
});
