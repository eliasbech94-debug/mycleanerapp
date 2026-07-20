/**
 * Small LRU cache used to dedupe address-lookup network calls made within
 * a single browser session. Keyed by the normalized query + provider source
 * so the same user typing "sonder boulevard 18" twice never hits the API
 * twice within the TTL. Values are the raw provider suggestion arrays.
 *
 * Bounds: max 200 entries, 10-minute TTL — this matches the plan and is
 * small enough to live in memory without pressure.
 */
type Entry<V> = { value: V; expiresAt: number };

export class LruCache<V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private map = new Map<string, Entry<V>>();

  constructor(max = 200, ttlMs = 10 * 60 * 1000) {
    this.max = max;
    this.ttlMs = ttlMs;
  }

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency by re-inserting.
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.map.size > this.max) {
      // Delete oldest.
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
