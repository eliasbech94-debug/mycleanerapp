/**
 * Phase 5A — routing/layout gates.
 */
import { describe, it, expect } from "vitest";
import {
  isMobileShellHiddenHeaderRoute,
  shouldHideHeaderForMobileProfile,
} from "@/components/layout/Header";
import { shouldShowMobileNav } from "@/components/layout/MobileBottomNav";
import { matchesMobileAppRoute } from "@/hooks/useIsMobileApp";

describe("Phase 5A routing", () => {
  it("hides global header on /inbox and country-prefixed /inbox", () => {
    expect(isMobileShellHiddenHeaderRoute("/inbox")).toBe(true);
    expect(isMobileShellHiddenHeaderRoute("/inbox/abc")).toBe(true);
    expect(isMobileShellHiddenHeaderRoute("/dk/inbox")).toBe(true);
    expect(isMobileShellHiddenHeaderRoute("/gb/inbox/xyz")).toBe(true);
  });

  it("hides global header for /profil only when no ?tab= is set", () => {
    expect(shouldHideHeaderForMobileProfile("/profil", "")).toBe(true);
    expect(shouldHideHeaderForMobileProfile("/dk/profil", "")).toBe(true);
    expect(shouldHideHeaderForMobileProfile("/profil", "?tab=info")).toBe(false);
    expect(shouldHideHeaderForMobileProfile("/profil", "?tab=inbox")).toBe(false);
    expect(shouldHideHeaderForMobileProfile("/marketplace", "")).toBe(false);
  });

  it("bottom nav appears on /inbox and country prefixes", () => {
    expect(shouldShowMobileNav("/inbox")).toBe(true);
    expect(shouldShowMobileNav("/inbox/abc")).toBe(true);
    expect(shouldShowMobileNav("/dk/inbox")).toBe(true);
    expect(shouldShowMobileNav("/gb/inbox/xyz")).toBe(true);
    expect(shouldShowMobileNav("/profil")).toBe(true);
    expect(shouldShowMobileNav("/es/profil")).toBe(true);
  });

  it("mobile app shell whitelist covers /inbox and /profil", () => {
    expect(matchesMobileAppRoute("/inbox")).toBe(true);
    expect(matchesMobileAppRoute("/inbox/abc")).toBe(true);
    expect(matchesMobileAppRoute("/profil")).toBe(true);
    expect(matchesMobileAppRoute("/dk/profil")).toBe(true);
  });
});
