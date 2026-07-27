import { describe, it, expect } from "vitest";
import { matchesMobileAppRoute, normalizePath, MOBILE_APP_ROUTE_WHITELIST } from "./useIsMobileApp";

describe("useIsMobileApp — route whitelist", () => {
  it("normalizes country-prefixed paths", () => {
    expect(normalizePath("/dk/find-cleaner")).toBe("/find-cleaner");
    expect(normalizePath("/gb")).toBe("/");
    expect(normalizePath("/se/profil")).toBe("/profil");
    expect(normalizePath("/es/faq")).toBe("/faq");
    expect(normalizePath("/find-cleaner")).toBe("/find-cleaner");
  });

  it("matches whitelisted marketplace/profile routes", () => {
    for (const p of ["/", "/find-cleaner", "/marketplace", "/book", "/mine-bookinger",
                     "/customer", "/customer/bookings", "/profil", "/faq", "/regler",
                     "/inbox", "/p/some-slug", "/dk/", "/gb/find-cleaner"]) {
      expect(matchesMobileAppRoute(p), p).toBe(true);
    }
  });

  it("does not match admin / provider / support / auth routes", () => {
    for (const p of ["/admin", "/admin/users", "/provider-dashboard", "/provider/pricing",
                     "/support", "/support/inbox", "/login", "/reset-password",
                     "/admin/design-system", "/task/create"]) {
      expect(matchesMobileAppRoute(p), p).toBe(false);
    }
  });

  it("exports the whitelist for external inspection", () => {
    expect(MOBILE_APP_ROUTE_WHITELIST.length).toBeGreaterThan(0);
  });
});
