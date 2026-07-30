/**
 * Deterministic pseudo-random helpers for the demo fixture layer.
 *
 * Development / preview only. Everything derived from these helpers is pure,
 * local and reproducible: the same seed always yields the same dataset, so
 * screenshots and tests stay stable across reloads.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

export const pickMany = <T,>(rng: Rng, items: readonly T[], count: number): T[] => {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
};

export const intBetween = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export const chance = (rng: Rng, probability: number) => rng() < probability;

/** Stable "today" for the demo dataset so relative dates never drift mid-session. */
export const DEMO_NOW = new Date();

export const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
export const addDays = (date: Date, days: number) => addMinutes(date, days * 24 * 60);

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Memoise an expensive fixture builder so large datasets are built at most once. */
export function lazy<T>(factory: () => T): () => T {
  let cached: { value: T } | null = null;
  return () => {
    if (!cached) cached = { value: factory() };
    return cached.value;
  };
}
