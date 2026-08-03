/**
 * Find Cleaner — privacy, ranking and search-contract tests.
 *
 * These lock the guarantee that no exact provider address or coordinate can
 * reach the map, and that results are ordered the way the product spec
 * requires.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  FORBIDDEN_PUBLIC_FIELDS,
  anonymizeGeoPoint,
  distanceKm,
  mapRow,
  publicDisplayName,
  rankProviders,
  rankScore,
  searchProvidersAround,
  type PublicProvider,
} from "@/lib/providerSearch";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const base: PublicProvider = {
  slug: "anna-k",
  userId: "u1",
  displayName: "Anna K.",
  avatarUrl: null,
  countryCode: "DK",
  publicArea: "Nørrebro",
  publicLat: 55.69,
  publicLng: 12.55,
  serviceRadiusKm: 10,
  distanceKm: 2,
  coversLocation: true,
  priceFrom: 249,
  currency: "DKK",
  languages: ["Dansk"],
  serviceCategories: ["home"],
  yearsExperience: 4,
  avgResponseMinutes: 30,
  verified: true,
  rating: 4.9,
  reviews: 22,
  completedBookings: 40,
  relevance: 0,
};

describe("provider search privacy", () => {
  it("never exposes the full legal name", () => {
    expect(publicDisplayName("Anna Kowalska")).toBe("Anna K.");
    expect(publicDisplayName("Jens Peter Hansen")).toBe("Jens H.");
    expect(publicDisplayName(null)).toBe("Cleaner");
  });

  it("anonymises coordinates to an area grid, deterministically", () => {
    const exact = { lat: 55.6845123, lng: 12.5723456 };
    const a = anonymizeGeoPoint(exact.lat, exact.lng, "provider-1");
    const b = anonymizeGeoPoint(exact.lat, exact.lng, "provider-1");
    expect(a).toEqual(b); // stable across sessions
    expect(a.lat).not.toBeCloseTo(exact.lat, 4);
    expect(a.lng).not.toBeCloseTo(exact.lng, 4);
    // Still in the right neighbourhood (< ~2 km away), but never precise.
    expect(distanceKm(exact, a)).toBeLessThan(2.5);
    expect(distanceKm(exact, a)).toBeGreaterThan(0.01);
  });

  it("gives different providers different offsets from the same address", () => {
    const a = anonymizeGeoPoint(55.6845, 12.5723, "provider-1");
    const b = anonymizeGeoPoint(55.6845, 12.5723, "provider-2");
    expect(a).not.toEqual(b);
  });

  it("mapRow drops every private field from the RPC payload", () => {
    const mapped = mapRow({
      user_id: "u1",
      display_name: "Anna Kowalska",
      public_area: "Nørrebro",
      public_lat: 55.69,
      public_lng: 12.55,
      country_code: "dk",
      // Hostile payload: even if the server regressed, these must not survive.
      address: "Sønder Boulevard 18, 1720 København",
      lat: 55.6845123,
      lng: 12.5723456,
      full_name: "Anna Kowalska",
      date_of_birth: "1990-01-01",
    });
    const keys = Object.keys(mapped);
    FORBIDDEN_PUBLIC_FIELDS.forEach((f) => expect(keys).not.toContain(f));
    expect(mapped.displayName).toBe("Anna K.");
    expect(JSON.stringify(mapped)).not.toContain("Sønder Boulevard");
  });

  it("client code never calls the removed leaky bounds RPC", () => {
    const page = read("src/pages/FindCleaner.tsx");
    const lib = read("src/lib/providerSearch.ts");
    expect(page).not.toContain("get_providers_in_bounds");
    expect(lib).not.toContain("get_providers_in_bounds");
  });

  it("the map only ever renders server-provided public coordinates", () => {
    const map = read("src/components/findcleaner/ProviderMap.tsx");
    expect(map).toContain("publicLat");
    expect(map).toContain("publicLng");
    expect(map).not.toMatch(/\bp\.lat\b|\bp\.lng\b/);
    // Zoom is capped so a pin can never be resolved to a single house.
    expect(map).toContain("MAX_FOCUS_ZOOM");
  });
});

describe("relevance ranking", () => {
  it("prefers providers that cover the job location", () => {
    const covers = { ...base, userId: "covers", coversLocation: true, distanceKm: 9 };
    const outside = { ...base, userId: "outside", coversLocation: false, distanceKm: 1 };
    expect(rankProviders([outside, covers], 15)[0].userId).toBe("covers");
  });

  it("prefers closer providers when coverage is equal", () => {
    const near = { ...base, userId: "near", distanceKm: 1 };
    const far = { ...base, userId: "far", distanceKm: 12 };
    expect(rankProviders([far, near], 15)[0].userId).toBe("near");
  });

  it("ranks unavailable providers below available ones", () => {
    const busy = { ...base, userId: "busy", availableForSelectedTime: false };
    const free = { ...base, userId: "free", availableForSelectedTime: true };
    expect(rankScore(free, 15)).toBeGreaterThan(rankScore(busy, 15));
  });

  it("breaks ties on rating then completed jobs", () => {
    const good = { ...base, userId: "good", rating: 4.9, completedBookings: 80 };
    const ok = { ...base, userId: "ok", rating: 4.1, completedBookings: 3 };
    expect(rankProviders([ok, good], 15)[0].userId).toBe("good");
  });
});

describe("searchProvidersAround", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates all filtering to the server RPC", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    await searchProvidersAround({ lat: 55.6, lng: 12.5 }, 20, {
      serviceCategory: "home",
      language: "Dansk",
      maxHourlyRate: 300,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [name, args] = (supabase.rpc as any).mock.calls[0];
    expect(name).toBe("search_providers_public_geo_v1");
    expect(args).toMatchObject({
      _lat: 55.6,
      _lng: 12.5,
      _radius_km: 20,
      _service_category: "home",
      _language: "Dansk",
      _max_hourly_rate: 300,
    });
  });

  it("propagates RPC errors instead of falling back to unfiltered data", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(searchProvidersAround({ lat: 1, lng: 1 }, 10)).rejects.toBeTruthy();
  });
});
