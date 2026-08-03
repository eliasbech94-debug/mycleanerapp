import { describe, it, expect } from "vitest";
import { countryPrefixFromPathname, withCountryPrefix } from "@/lib/countryPath";

describe("countryPath", () => {
  it("detects market prefixes", () => {
    expect(countryPrefixFromPathname("/dk/customer/notifications")).toBe("dk");
    expect(countryPrefixFromPathname("/customer/notifications")).toBeNull();
    expect(countryPrefixFromPathname("/")).toBeNull();
  });

  it("preserves the prefix on redirects", () => {
    expect(withCountryPrefix("dk", "/profil?tab=inbox")).toBe("/dk/profil?tab=inbox");
    expect(withCountryPrefix(null, "/profil")).toBe("/profil");
    expect(withCountryPrefix("se", "/se/profil")).toBe("/se/profil");
    expect(withCountryPrefix("dk", "relative")).toBe("relative");
    expect(withCountryPrefix("dk", "/")).toBe("/dk");
  });
});
