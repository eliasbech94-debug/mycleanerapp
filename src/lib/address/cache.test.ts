import { describe, it, expect } from "vitest";
import { LruCache } from "./cache";

describe("LruCache", () => {
  it("returns undefined for missing keys", () => {
    const c = new LruCache<string>();
    expect(c.get("x")).toBeUndefined();
  });

  it("stores and returns values", () => {
    const c = new LruCache<string>();
    c.set("k", "v");
    expect(c.get("k")).toBe("v");
  });

  it("evicts the oldest entry when exceeding max", () => {
    const c = new LruCache<number>(2, 60_000);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  it("respects TTL", async () => {
    const c = new LruCache<string>(10, 5);
    c.set("k", "v");
    await new Promise((r) => setTimeout(r, 15));
    expect(c.get("k")).toBeUndefined();
  });

  it("refreshes recency on get", () => {
    const c = new LruCache<number>(2, 60_000);
    c.set("a", 1);
    c.set("b", 2);
    // Touch "a" so "b" becomes the oldest.
    c.get("a");
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
  });
});
