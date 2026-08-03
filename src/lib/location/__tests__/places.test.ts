import { describe, it, expect } from "vitest";
import {
  coarsen,
  distanceKm,
  findPlaceByName,
  findPlaceByPostcode,
  findPlaceBySlug,
  mapPlaceRow,
  nearestPlace,
  placeToLocation,
  placesForCountry,
  roundedDistanceKm,
} from "../places";
import type { MarketPlace } from "../types";

const places: MarketPlace[] = [
  {
    id: "1", countryCode: "DK", name: "København", slug: "kobenhavn", municipality: "København",
    postcodePrefixes: ["10", "11", "12", "2100"], lat: 55.6761, lng: 12.5683, defaultRadiusKm: 25, sortOrder: 1,
  },
  {
    id: "2", countryCode: "DK", name: "Aarhus", slug: "aarhus", municipality: "Aarhus",
    postcodePrefixes: ["80"], lat: 56.1629, lng: 10.2039, defaultRadiusKm: 25, sortOrder: 2,
  },
  {
    id: "3", countryCode: "GB", name: "London", slug: "london", municipality: null,
    postcodePrefixes: ["S", "SW"], lat: 51.5072, lng: -0.1276, defaultRadiusKm: 30, sortOrder: 1,
  },
];

describe("market place mapping", () => {
  it("normalises rows and applies defaults", () => {
    const p = mapPlaceRow({
      id: "x", country_code: "se", name: "Malmö", slug: "malmo", municipality: null,
      postcode_prefixes: null, lat: "55.6", lng: "13.0", default_radius_km: null, sort_order: null,
    });
    expect(p.countryCode).toBe("SE");
    expect(p.postcodePrefixes).toEqual([]);
    expect(p.lat).toBe(55.6);
    expect(p.defaultRadiusKm).toBe(25);
  });
});

describe("lookup", () => {
  it("scopes by country", () => {
    expect(placesForCountry(places, "dk").map((p) => p.slug)).toEqual(["kobenhavn", "aarhus"]);
    expect(placesForCountry(places, null)).toEqual([]);
  });

  it("finds by slug within country", () => {
    expect(findPlaceBySlug(places, "DK", "aarhus")?.name).toBe("Aarhus");
    expect(findPlaceBySlug(places, "DK", "nope")).toBeNull();
  });

  it("finds by postcode with longest-prefix wins", () => {
    expect(findPlaceByPostcode(places, "DK", "2100")?.slug).toBe("kobenhavn");
    expect(findPlaceByPostcode(places, "DK", "8000")?.slug).toBe("aarhus");
    expect(findPlaceByPostcode(places, "GB", "SW1A 1AA")?.slug).toBe("london");
    expect(findPlaceByPostcode(places, "DK", null)).toBeNull();
  });

  it("finds by name ignoring case and accents", () => {
    expect(findPlaceByName(places, "DK", "kobenhavn")?.slug).toBe("kobenhavn");
    expect(findPlaceByName(places, "DK", "  AARHUS ")?.slug).toBe("aarhus");
    expect(findPlaceByName(places, "DK", "Berlin")).toBeNull();
  });
});

describe("geometry & privacy", () => {
  it("computes distances", () => {
    const km = distanceKm({ lat: 55.6761, lng: 12.5683 }, { lat: 56.1629, lng: 10.2039 });
    expect(Math.round(km)).toBeGreaterThan(140);
    expect(Math.round(km)).toBeLessThan(170);
  });

  it("never exposes a sub-kilometre distance", () => {
    expect(roundedDistanceKm(0.2)).toBe(1);
    expect(roundedDistanceKm(4.4)).toBe(4);
    expect(roundedDistanceKm(12.7, 5)).toBe(15);
  });

  it("coarsens coordinates to a ~1km grid", () => {
    const c = coarsen(55.67611234, 12.56831234);
    expect(c.lat).toBeCloseTo(55.68, 5);
    expect(c.lng).toBeCloseTo(12.57, 5);
  });

  it("finds the nearest curated place", () => {
    const near = nearestPlace(places, { lat: 55.7, lng: 12.6 });
    expect(near?.place.slug).toBe("kobenhavn");
  });
});

describe("placeToLocation", () => {
  it("produces a city-precision location", () => {
    const loc = placeToLocation(places[0], "manual");
    expect(loc).toMatchObject({
      countryCode: "DK", city: "København", citySlug: "kobenhavn",
      precision: "city", source: "manual", radiusKm: 25,
    });
    expect(loc.postcode).toBeNull();
  });
});
