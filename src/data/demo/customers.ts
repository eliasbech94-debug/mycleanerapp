import { DEMO_PROVIDER_FIXTURES } from "./providers";
import { addDays, chance, DEMO_NOW, hashSeed, intBetween, lazy, mulberry32, pick } from "./random";

/** Demo customers — development / preview only, never persisted. */
export type DemoCustomerSegment = "family" | "student" | "business" | "airbnb_host" | "senior";

export type DemoCustomer = {
  id: string;
  display_name: string;
  avatar_url: string;
  city: string;
  country_code: string;
  segment: DemoCustomerSegment;
  joined_at: string;
  total_bookings: number;
};

const AVATARS = [
  "photo-1494790108377-be9c29b29330",
  "photo-1500648767791-00dcc994a43e",
  "photo-1534528741775-53994a69daeb",
  "photo-1517841905240-472988babdf9",
  "photo-1506794778202-cad84cf45f1d",
  "photo-1519345182560-3f2917c472ef",
  "photo-1508214751196-bcfd4ca60f91",
  "photo-1524504388940-b1c1722653e1",
  "photo-1531123897727-8f129e1688ce",
  "photo-1489424731084-a5d8b219a5bb",
  "photo-1546525848-3ce03ca516f6",
  "photo-1552374196-c4e7ffc6e126",
  "photo-1517070208541-6ddc4d3efbcb",
  "photo-1499996860823-5214fcc65f8f",
  "photo-1544723795-3fb6469f5b39",
  "photo-1502823403499-6ccfcf4fb453",
];

const FIRST_NAMES = [
  "Sofie", "Mikkel", "Anna", "Lars", "Emma", "Jonas", "Ida", "Frederik", "Clara", "Oliver",
  "Linnea", "Erik", "Astrid", "Johan", "Elsa", "Gustav", "Hanna", "Nils",
  "Charlotte", "Thomas", "Olivia", "Harry", "Grace", "Daniel", "Amelia", "Jack",
  "Lena", "Felix", "Marie", "Lukas", "Greta", "Paul", "Lucía", "Javier", "Marta", "Diego",
];

const LAST_NAMES = [
  "Jensen", "Nielsen", "Hansen", "Andersen", "Larsen", "Pedersen", "Kristensen", "Møller",
  "Andersson", "Johansson", "Lindqvist", "Bergström",
  "Smith", "Taylor", "Walker", "Bennett",
  "Müller", "Schneider", "Fischer", "Weber",
  "García", "Fernández", "Ruiz", "Serrano",
];

const CITY_BY_COUNTRY: Record<string, string[]> = {
  DK: ["København", "Aarhus", "Odense", "Aalborg", "Frederiksberg"],
  SE: ["Stockholm", "Göteborg", "Malmö", "Uppsala"],
  GB: ["London", "Manchester", "Bristol", "Edinburgh"],
  DE: ["Berlin", "Hamburg", "München", "Köln"],
  ES: ["Madrid", "Barcelona", "Valencia", "Málaga"],
};

const SEGMENTS: DemoCustomerSegment[] = ["family", "student", "business", "airbnb_host", "senior"];

export const DEMO_CUSTOMER_COUNT = 80;

export const getDemoCustomers = lazy<DemoCustomer[]>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-customers"));
  const countries = Array.from(new Set(DEMO_PROVIDER_FIXTURES.map((p) => p.country_code)));
  const used = new Set<string>();
  const rows: DemoCustomer[] = [];

  for (let i = 0; i < DEMO_CUSTOMER_COUNT; i += 1) {
    let name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    let guard = 0;
    while (used.has(name) && guard < 40) {
      name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      guard += 1;
    }
    used.add(name);

    const country = pick(rng, countries.length ? countries : ["DK"]);
    const segment = SEGMENTS[i % SEGMENTS.length];
    const joined = addDays(DEMO_NOW, -intBetween(rng, 20, 1500));

    rows.push({
      id: `demo-customer-${i + 1}`,
      display_name: name,
      avatar_url: `https://images.unsplash.com/${pick(rng, AVATARS)}?auto=format&fit=facearea&w=160&h=160&facepad=2.6&q=80`,
      city: pick(rng, CITY_BY_COUNTRY[country] ?? CITY_BY_COUNTRY.DK),
      country_code: country,
      segment,
      joined_at: joined.toISOString(),
      total_bookings: chance(rng, 0.25) ? intBetween(rng, 12, 48) : intBetween(rng, 1, 11),
    });
  }
  return rows;
});

export const getDemoCustomer = (id: string): DemoCustomer | null =>
  getDemoCustomers().find((c) => c.id === id) ?? null;
