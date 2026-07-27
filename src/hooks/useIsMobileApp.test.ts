import { describe, it, expect } from "vitest";
import {
  matchesMobileAppRoute,
  normalizePath,
  MOBILE_APP_ROUTE_WHITELIST,
  MARKET_PREFIXES,
} from "./useIsMobileApp";

describe("useIsMobileApp — normalizePath", () => {
  it("strips every existing market prefix", () => {
    expect(normalizePath("/dk/find-cleaner")).toBe("/find-cleaner");
    expect(normalizePath("/gb/find-cleaner")).toBe("/find-cleaner");
    expect(normalizePath("/se/find-cleaner")).toBe("/find-cleaner");
    expect(normalizePath("/es/find-cleaner")).toBe("/find-cleaner");
  });

  it("normalizes bare market prefix to '/'", () => {
    for (const c of MARKET_PREFIXES) {
      expect(normalizePath(`/${c}`)).toBe("/");
      expect(normalizePath(`/${c}/`)).toBe("/");
    }
  });

  it("preserves nested subpaths after stripping the market", () => {
    expect(normalizePath("/dk/customer/bookings")).toBe("/customer/bookings");
    expect(normalizePath("/gb/p/some-slug")).toBe("/p/some-slug");
    expect(normalizePath("/es/mine-bookinger/123")).toBe("/mine-bookinger/123");
  });

  it("does NOT strip non-market prefixes (Germany /de and legacy /uk are not routes)", () => {
    // Router only mounts dk|gb|se|es. /de and /uk must pass through unchanged
    // so they surface as 404s rather than being silently rewritten.
    expect(normalizePath("/de")).toBe("/de");
    expect(normalizePath("/de/find-cleaner")).toBe("/de/find-cleaner");
    expect(normalizePath("/uk/find-cleaner")).toBe("/uk/find-cleaner");
  });

  it("does not strip lookalike segments (false positives)", () => {
    expect(normalizePath("/design")).toBe("/design");
    expect(normalizePath("/debug")).toBe("/debug");
    expect(normalizePath("/desktop")).toBe("/desktop");
    expect(normalizePath("/gbp")).toBe("/gbp");
    expect(normalizePath("/session")).toBe("/session");
  });

  it("only strips a market prefix at the leading segment", () => {
    expect(normalizePath("/customer/dk")).toBe("/customer/dk");
    expect(normalizePath("/p/gb-cleaners")).toBe("/p/gb-cleaners");
  });
});

describe("useIsMobileApp — whitelist matching", () => {
  it("matches whitelisted marketplace/customer routes", () => {
    for (const p of [
      "/",
      "/find-cleaner",
      "/marketplace",
      "/book",
      "/book/abc",
      "/mine-bookinger",
      "/customer",
      "/customer/bookings",
      "/profil",
      "/profil?tab=inbox",
      "/inbox",
      "/p/some-slug",
    ]) {
      expect(matchesMobileAppRoute(p.split("?")[0]), p).toBe(true);
    }
  });

  it("matches whitelisted routes under every market prefix", () => {
    for (const c of MARKET_PREFIXES) {
      expect(matchesMobileAppRoute(`/${c}`), `/${c}`).toBe(true);
      expect(matchesMobileAppRoute(`/${c}/find-cleaner`)).toBe(true);
      expect(matchesMobileAppRoute(`/${c}/customer/bookings`)).toBe(true);
      expect(matchesMobileAppRoute(`/${c}/p/some-slug`)).toBe(true);
    }
  });

  it("excludes static informational pages (/faq, /regler) from the shell", () => {
    for (const p of ["/faq", "/regler", "/dk/faq", "/gb/regler"]) {
      expect(matchesMobileAppRoute(p), p).toBe(false);
    }
  });

  it("does not match admin / provider / support / auth routes", () => {
    for (const p of [
      "/admin",
      "/admin/users",
      "/admin/design-system",
      "/provider-dashboard",
      "/provider/pricing",
      "/provider/finance",
      "/provider/disputes",
      "/provider/profile",
      "/provider/bilag",
      "/bliv-cleaner",
      "/support",
      "/support/inbox",
      "/login",
      "/reset-password",
      "/task/create",
    ]) {
      expect(matchesMobileAppRoute(p), p).toBe(false);
    }
  });

  it("does not match false-positive lookalike paths", () => {
    for (const p of ["/design", "/debug", "/desktop", "/de", "/de/find-cleaner", "/uk/find-cleaner"]) {
      expect(matchesMobileAppRoute(p), p).toBe(false);
    }
  });

  it("exports the whitelist for external inspection", () => {
    expect(MOBILE_APP_ROUTE_WHITELIST.length).toBeGreaterThan(0);
  });
});
