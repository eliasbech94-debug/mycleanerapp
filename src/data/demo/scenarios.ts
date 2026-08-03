/**
 * Demo scenarios — development / preview only.
 *
 * A scenario re-shapes the *presentation* of the local fixtures (how many
 * providers are visible, how busy the marketplace looks, how strong ratings
 * are). It never touches the database, never writes anything and is stripped
 * from production builds together with the rest of the demo layer.
 */
export type DemoScenarioId =
  | "busy"
  | "normal"
  | "quiet"
  | "premium"
  | "fully_booked"
  | "new_marketplace";

export type DemoScenario = {
  id: DemoScenarioId;
  label: string;
  emoji: string;
  description: string;
  /** Share of the 24 provider fixtures that are visible. */
  providerShare: number;
  /** Multiplier applied to review / booking volumes. */
  activityMultiplier: number;
  /** Minimum average rating for visible providers. */
  minRating: number;
  /** Only premium/pro tiers when true. */
  premiumOnly: boolean;
  /** Every provider's calendar is fully booked. */
  fullyBooked: boolean;
  /** Brand new marketplace: tiny history, no reviews. */
  fresh: boolean;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "busy",
    label: "Busy Marketplace",
    emoji: "🟢",
    description: "Alle providere aktive, høj booking- og anmeldelsesvolumen.",
    providerShare: 1,
    activityMultiplier: 1.4,
    minRating: 0,
    premiumOnly: false,
    fullyBooked: false,
    fresh: false,
  },
  {
    id: "normal",
    label: "Normal Activity",
    emoji: "🟡",
    description: "Standard demo-datasæt — realistisk hverdagsaktivitet.",
    providerShare: 1,
    activityMultiplier: 1,
    minRating: 0,
    premiumOnly: false,
    fullyBooked: false,
    fresh: false,
  },
  {
    id: "quiet",
    label: "Quiet Marketplace",
    emoji: "🔴",
    description: "Få providere, lav aktivitet — test af tynde lister.",
    providerShare: 0.3,
    activityMultiplier: 0.3,
    minRating: 0,
    premiumOnly: false,
    fullyBooked: false,
    fresh: false,
  },
  {
    id: "premium",
    label: "Premium Providers",
    emoji: "⭐",
    description: "Kun pro/premium-profiler med 4.8+ i gennemsnit.",
    providerShare: 1,
    activityMultiplier: 1.1,
    minRating: 4.8,
    premiumOnly: true,
    fullyBooked: false,
    fresh: false,
  },
  {
    id: "fully_booked",
    label: "Fully Booked",
    emoji: "📅",
    description: "Ingen ledige tider — test af ventelister og tomme kalendere.",
    providerShare: 1,
    activityMultiplier: 1.3,
    minRating: 0,
    premiumOnly: false,
    fullyBooked: true,
    fresh: false,
  },
  {
    id: "new_marketplace",
    label: "New Marketplace",
    emoji: "🆕",
    description: "Nystartet platform: få anmeldelser og kort historik.",
    providerShare: 0.45,
    activityMultiplier: 0.08,
    minRating: 0,
    premiumOnly: false,
    fullyBooked: false,
    fresh: true,
  },
];

export const DEFAULT_SCENARIO_ID: DemoScenarioId = "normal";

const STORAGE_KEY = "mycleaner.demo.scenario";

const readStored = (): DemoScenarioId => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && DEMO_SCENARIOS.some((s) => s.id === raw)) return raw as DemoScenarioId;
  } catch {
    /* noop */
  }
  return DEFAULT_SCENARIO_ID;
};

let current: DemoScenarioId = typeof window === "undefined" ? DEFAULT_SCENARIO_ID : readStored();
const listeners = new Set<() => void>();

export const getDemoScenarioId = (): DemoScenarioId => current;

export const getDemoScenario = (): DemoScenario =>
  DEMO_SCENARIOS.find((s) => s.id === current) ?? DEMO_SCENARIOS[1];

export function setDemoScenario(id: DemoScenarioId) {
  if (current === id) return;
  current = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* noop */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeDemoScenario(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
