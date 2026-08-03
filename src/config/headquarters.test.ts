import { describe, expect, it } from "vitest";
import { HEADQUARTERS, formatHeadquartersAddress } from "@/config/headquarters";
import { countryMapPoint, countryMapPoints } from "@/config/countryGeo";
import { COMPANY } from "@/config/company";

describe("MyCleaner headquarters config", () => {
  it("uses the verified public company address as single source of truth", () => {
    expect(HEADQUARTERS.name).toBe(COMPANY.legalName);
    expect(formatHeadquartersAddress()).toBe(
      "1 Coldbath Square, London, EC1R 5HL, United Kingdom",
    );
    expect(HEADQUARTERS.label).toBe("Headquarters");
    expect(HEADQUARTERS.tagline).toBe("The heart of trust in home cleaning.");
  });

  it("carries the geocoded coordinates", () => {
    expect(HEADQUARTERS.lat).toBeCloseTo(51.524, 3);
    expect(HEADQUARTERS.lng).toBeCloseTo(-0.11037, 5);
    expect(HEADQUARTERS.geocode.source).toBe("mapbox-geocoding-v6");
  });
});

describe("countryMapPoint", () => {
  it("normalises UK to GB and resolves name + flag", () => {
    const gb = countryMapPoint("uk");
    expect(gb?.code).toBe("GB");
    expect(gb?.flag).toBe("🇬🇧");
    expect(typeof gb?.lat).toBe("number");
  });

  it("skips unknown / invalid codes", () => {
    expect(countryMapPoint("ZZ")).toBeNull();
    expect(countryMapPoint("")).toBeNull();
    expect(countryMapPoints(["DK", "ZZ", "SE"]).map((p) => p.code)).toEqual(["DK", "SE"]);
  });
});
