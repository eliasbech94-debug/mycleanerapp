import { Country, countries, serviceCategories, formatPrice } from "./countries";

export type ServiceUnit = "hour" | "job" | "m2";

export interface ProviderService {
  subcategory: string;
  categoryId: string;
  price: number;       // per unit, in country currency
  unit: ServiceUnit;
  minPrice: number;    // minimum job price in country currency
  description: string;
  rateMultiplier: number; // multiplier applied to country's min hourly rate
  minJobHours: number;    // hours used to derive minPrice
}

export interface ProviderProfileData {
  id: string;
  name: string;
  handle: string;
  tagline: string;
  bio: string;
  type: "private" | "business";
  verified: boolean;
  topRated: boolean;
  rating: number;
  reviews: number;
  jobsCompleted: number;
  responseTime: string;
  repeatClients: number;
  city: string;
  countryCode: string;
  radiusKm: number;
  memberSince: string;
  languages: string[];
  categories: string[];      // category ids
  subcategories: string[];   // chosen subcategory names (subset across all categories)
  hourlyRate?: number;       // optional override, else derived
  avatar: string;
  gallery: string[];
  certifications: string[];
}

const STORAGE_KEY = "mycleaner.providers.v1";
const LEGACY_STORAGE_KEY = "homehero.providers.v1";

/* ---------- Auto pricing engine ----------
 * Prices are derived from the country's minimum hourly rate, the labor
 * agreement (via minHourlyRate baseline) and a per-subcategory multiplier
 * & unit map. Provider onboarding never has to type a price manually.
 */
type PricingRule = { unit: ServiceUnit; rateMultiplier: number; minJobHours: number; description: string };

const PRICING: Record<string, PricingRule> = {
  // Cleaning
  "Hjemmerengøring":   { unit: "hour", rateMultiplier: 2.2, minJobHours: 2, description: "Standard hjemmerengøring. Materialer medbringes." },
  "Erhvervsrengøring": { unit: "hour", rateMultiplier: 2.4, minJobHours: 3, description: "Kontor & butik. Fast aftale eller engangsopgave." },
  "Vinduespudsning":   { unit: "hour", rateMultiplier: 2.3, minJobHours: 1, description: "Indvendigt & udvendigt. Striber-fri finish." },
  "Dybrengøring":      { unit: "hour", rateMultiplier: 2.6, minJobHours: 4, description: "Grundig rengøring inkl. fuger, hvidevarer og lofter." },
  "Flytterengøring":   { unit: "job",  rateMultiplier: 2.5, minJobHours: 5, description: "Garanti for godkendelse ved fraflytning." },
  // Handyman
  "Malerarbejde":      { unit: "hour", rateMultiplier: 2.8, minJobHours: 4, description: "Vægge, lofter, træværk. Inkl. afdækning og oprydning." },
  "Tømrerarbejde":     { unit: "hour", rateMultiplier: 3.0, minJobHours: 2, description: "Reparation, montering & specialopgaver." },
  "VVS":               { unit: "hour", rateMultiplier: 3.4, minJobHours: 1, description: "Vandhaner, toiletter, mindre installationer." },
  "Elektriker":        { unit: "hour", rateMultiplier: 3.4, minJobHours: 1, description: "Autoriseret elinstallation & fejlfinding." },
  "Gulvlægning":       { unit: "m2",   rateMultiplier: 2.0, minJobHours: 6, description: "Laminat, vinyl & klikgulve. Materialer afregnes separat." },
  "Flisearbejde":      { unit: "m2",   rateMultiplier: 3.2, minJobHours: 6, description: "Bad, køkken & gulve. Vandtæt og holdbart." },
  // Garden
  "Plæneklipning":     { unit: "hour", rateMultiplier: 2.0, minJobHours: 1, description: "Inkl. trimning af kanter og bortskaffelse af afklip." },
  "Hækklipning":       { unit: "hour", rateMultiplier: 2.2, minJobHours: 2, description: "Vi medbringer eget professionelt udstyr." },
  "Haveanlæg":         { unit: "hour", rateMultiplier: 2.5, minJobHours: 4, description: "Belægning, beplantning, terrasser." },
  "Snerydning":        { unit: "job",  rateMultiplier: 2.0, minJobHours: 1, description: "Hurtig udkald. Salt/grus efter aftale." },
  "Terrasse & fliser": { unit: "m2",   rateMultiplier: 2.6, minJobHours: 8, description: "Lægning, udskiftning og rens." },
  // Moving
  "Boligflytning":     { unit: "hour", rateMultiplier: 3.0, minJobHours: 3, description: "2 mand + vogn. Forsikret transport i hele landet." },
  "Kontorflytning":    { unit: "hour", rateMultiplier: 3.4, minJobHours: 4, description: "Planlagt flow med minimal driftspause." },
  "Møbelsamling":      { unit: "hour", rateMultiplier: 2.4, minJobHours: 1, description: "IKEA, designermøbler & køkken." },
  "Bortskaffelse":     { unit: "job",  rateMultiplier: 2.0, minJobHours: 2, description: "Miljørigtig bortskaffelse. Pris efter mængde." },
  "Piano/tungt gods":  { unit: "job",  rateMultiplier: 4.0, minJobHours: 3, description: "Specialudstyr, forsikret og erfarent team." },
};

const DEFAULT: PricingRule = { unit: "hour", rateMultiplier: 2.5, minJobHours: 2, description: "Pris aftales ud fra opgavens omfang." };

const roundNice = (n: number) => {
  if (n < 30) return Math.round(n);
  if (n < 200) return Math.round(n / 5) * 5;
  return Math.round(n / 25) * 25;
};

export const deriveServices = (
  categoryIds: string[],
  subcategorySelection: string[] | null,
  country: Country,
): ProviderService[] => {
  const base = country.minHourlyRate;
  const out: ProviderService[] = [];
  for (const catId of categoryIds) {
    const cat = serviceCategories.find((c) => c.id === catId);
    if (!cat) continue;
    const subs = (subcategorySelection && subcategorySelection.length
      ? cat.subcategories.filter((s) => subcategorySelection.includes(s))
      : cat.subcategories);
    for (const sub of subs) {
      const rule = PRICING[sub] ?? DEFAULT;
      const price = roundNice(base * rule.rateMultiplier);
      const minPrice = roundNice(base * rule.rateMultiplier * rule.minJobHours);
      out.push({
        subcategory: sub,
        categoryId: catId,
        price: rule.unit === "m2" ? roundNice(price * 0.7) : price,
        unit: rule.unit,
        minPrice,
        description: rule.description,
        rateMultiplier: rule.rateMultiplier,
        minJobHours: rule.minJobHours,
      });
    }
  }
  return out;
};

export const deriveHourlyRate = (country: Country): number =>
  roundNice(country.minHourlyRate * 2.6);

/* ---------- Storage ---------- */

const SEED: Record<string, ProviderProfileData> = {
  p_001: {
    id: "p_001",
    name: "Mikkel Sørensen",
    handle: "@mikkel.clean",
    tagline: "Erfaren rengøringsassistent · 12 års erfaring",
    bio: "Grundig og pålidelig rengøring med sans for detaljen. Materialer medbringes efter aftale — altid ren arbejdsgang og fast pris før jeg starter.",
    type: "business",
    verified: true,
    topRated: true,
    rating: 4.92,
    reviews: 184,
    jobsCompleted: 312,
    responseTime: "< 1 t",
    repeatClients: 68,
    city: "København",
    countryCode: "DK",
    radiusKm: 25,
    memberSince: "2022",
    languages: ["Dansk", "English", "Deutsch"],
    categories: ["cleaning"],
    subcategories: ["Hjemmerengøring", "Dybrengøring", "Flytterengøring"],
    avatar: "",
    gallery: [
      "from-primary/30 to-accent/30",
      "from-accent/30 to-info/30",
      "from-info/30 to-primary/30",
      "from-success/30 to-primary/30",
      "from-primary/20 to-accent/40",
      "from-accent/40 to-success/30",
    ],
    certifications: ["Forsikret hos Tryg", "ID-verificeret", "Straffeattest godkendt"],
  },

  p_002: {
    id: "p_002",
    name: "Maria Jensen",
    handle: "@maria.rens",
    tagline: "Professionel rengøring · 15 års erfaring",
    bio: "Jeg tilbyder grundig og pålidelig rengøring til private og erhverv. Altid hurtig, effektiv og med øje for detaljer. Materialer medbringes efter aftale.",
    type: "private",
    verified: true,
    topRated: true,
    rating: 4.9,
    reviews: 127,
    jobsCompleted: 247,
    responseTime: "< 1 time",
    repeatClients: 78,
    city: "København",
    countryCode: "DK",
    radiusKm: 15,
    memberSince: "2021",
    languages: ["Dansk", "English"],
    categories: ["cleaning"],
    subcategories: ["Hjemmerengøring", "Dybrengøring", "Vinduespudsning"],
    avatar: "",
    gallery: [
      "from-primary/30 to-accent/30",
      "from-accent/30 to-info/30",
      "from-info/30 to-primary/30",
      "from-success/30 to-primary/30",
      "from-primary/20 to-accent/40",
      "from-accent/40 to-success/30",
    ],
    certifications: ["ID-verificeret", "Straffeattest godkendt"],
  },
  p_003: {
    id: "p_003",
    name: "Anders Sørensen",
    handle: "@anders.rens",
    tagline: "Erfaren rengøringsassistent · Kvalitet & tilfredshed",
    bio: "Jeg fokuserer på kvalitet og kundetilfredshed i hver eneste opgave. Hjemmerengøring og vinduespudsning er mine specialer. Altid til tiden.",
    type: "private",
    verified: true,
    topRated: false,
    rating: 4.7,
    reviews: 84,
    jobsCompleted: 156,
    responseTime: "< 2 timer",
    repeatClients: 62,
    city: "Aarhus",
    countryCode: "DK",
    radiusKm: 20,
    memberSince: "2023",
    languages: ["Dansk"],
    categories: ["cleaning"],
    subcategories: ["Hjemmerengøring", "Vinduespudsning"],
    avatar: "",
    gallery: [
      "from-primary/30 to-accent/30",
      "from-accent/30 to-info/30",
      "from-info/30 to-primary/30",
    ],
    certifications: ["ID-verificeret", "Straffeattest godkendt"],
  },
  p_004: {
    id: "p_004",
    name: "CleanPro ApS",
    handle: "@cleanpro",
    tagline: "Professionel rengøringsvirksomhed · Certificeret",
    bio: "CleanPro ApS er en professionel rengøringsvirksomhed med certificerede medarbejdere. Vi tilbyder erhvervsrengøring, hjemmerengøring og flytterengøring i hele landet.",
    type: "business",
    verified: true,
    topRated: true,
    rating: 4.8,
    reviews: 312,
    jobsCompleted: 892,
    responseTime: "< 30 min",
    repeatClients: 85,
    city: "Odense",
    countryCode: "DK",
    radiusKm: 50,
    memberSince: "2020",
    languages: ["Dansk", "English", "Deutsch"],
    categories: ["cleaning"],
    subcategories: ["Erhvervsrengøring", "Hjemmerengøring", "Flytterengøring"],
    avatar: "",
    gallery: [
      "from-primary/30 to-accent/30",
      "from-accent/30 to-info/30",
      "from-info/30 to-primary/30",
      "from-success/30 to-primary/30",
      "from-primary/20 to-accent/40",
      "from-accent/40 to-success/30",
    ],
    certifications: ["ISO 9001", "Arbejdsmiljøcertificeret", "Forsikret", "ID-verificeret"],
  },
};

const readStore = (): Record<string, ProviderProfileData> => {
  if (typeof window === "undefined") return {};
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migrate from legacy HomeHero key
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        window.localStorage.setItem(STORAGE_KEY, legacy);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        raw = legacy;
      }
    }
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeStore = (s: Record<string, ProviderProfileData>) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
};

export const getProvider = (id: string): ProviderProfileData | null => {
  const store = readStore();
  return store[id] ?? SEED[id] ?? null;
};

export const saveProvider = (p: ProviderProfileData) => {
  const store = readStore();
  store[p.id] = p;
  writeStore(store);
};

export const getCountry = (code: string): Country =>
  countries.find((c) => c.code === code) || countries[0];

export { formatPrice };
