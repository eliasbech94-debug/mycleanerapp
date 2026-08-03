/**
 * Europe showcase fixtures — DEVELOPMENT / PREVIEW ONLY.
 *
 * Used purely so the default (pre-search) Find Cleaner map is never empty while
 * a market has no real providers yet. These are fictional, deterministic points
 * scattered inside a country outline from a country centroid — they are NOT
 * derived from any real person, address or database row, so there is no privacy
 * surface at all. Production hosts never reach this module (DEMO_MODE gate).
 */
import { countryMapPoints } from "@/config/countryGeo";
import { currencyForCountry, type PublicProvider } from "@/lib/providerSearch";

const FIRST = [
  "Mikkel", "Maria", "Anders", "Sofia", "Lucas", "Emma", "Jonas", "Elena",
  "Noah", "Freja", "Hannah", "Marco", "Olivia", "Erik", "Laura", "Tomas",
];
const LAST = "ABCDEFGHIJKLMNOPRSTVW";
const SERVICES = ["Hjemmerengøring", "Dybrengøring", "Flytterengøring", "Vinduespudsning"];

/** Deterministic 0..1 pseudo-random from a string seed. */
function rnd(seed: string) {
  let acc = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    acc ^= seed.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  return ((acc >>> 0) % 100000) / 100000;
}

/** Build `perCountry` symbolic providers for each active market code. */
export function europeShowcaseProviders(codes: string[], perCountry = 45): PublicProvider[] {
  const out: PublicProvider[] = [];
  countryMapPoints(codes).forEach((c) => {
    for (let i = 0; i < perCountry; i += 1) {
      const id = `showcase_${c.code}_${i}`;
      const a = rnd(`${id}:a`);
      const b = rnd(`${id}:b`);
      const r = Math.sqrt(rnd(`${id}:r`));
      const theta = rnd(`${id}:t`) * Math.PI * 2;
      const first = FIRST[Math.floor(a * FIRST.length) % FIRST.length];
      const initial = LAST[Math.floor(b * LAST.length) % LAST.length];
      out.push({
        slug: null,
        userId: id,
        displayName: `${first} ${initial}.`,
        avatarUrl: null,
        countryCode: c.code,
        publicArea: c.name,
        publicLng: c.lng + Math.cos(theta) * r * c.spread[0],
        publicLat: c.lat + Math.sin(theta) * r * c.spread[1],
        serviceRadiusKm: 10 + Math.round(a * 30),
        distanceKm: Math.round(r * 200),
        coversLocation: false,
        priceFrom: 180 + Math.round(b * 24) * 10,
        currency: currencyForCountry(c.code),
        languages: [],
        serviceCategories: [SERVICES[Math.floor(a * SERVICES.length) % SERVICES.length]],
        yearsExperience: 2 + Math.round(a * 11),
        avgResponseMinutes: 20 + Math.round(b * 60),
        verified: b > 0.25,
        rating: Math.round((4.3 + a * 0.7) * 100) / 100,
        reviews: 8 + Math.round(b * 240),
        completedBookings: 12 + Math.round(a * 400),
        relevance: 0,
      });
    }
  });
  return out;
}
