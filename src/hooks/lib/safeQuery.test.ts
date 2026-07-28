import { describe, it, expect } from "vitest";
import { safeQuery, aggregateError } from "./safeQuery";

describe("safeQuery", () => {
  it("returns data with null error on success", async () => {
    const res = await safeQuery("ok", Promise.resolve({ data: { id: 1 }, error: null }));
    expect(res).toEqual({ data: { id: 1 }, error: null });
  });

  it("returns friendly Danish error and preserves any data on PostgREST error", async () => {
    const res = await safeQuery(
      "boom",
      Promise.resolve({ data: null, error: { message: "internal SQL 42P01" } }),
    );
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/kunne ikke hente/i);
    // Never leaks raw SQL or internal messages
    expect(res.error).not.toMatch(/SQL|42P01|internal/i);
  });

  it("swallows thrown exceptions and returns friendly error", async () => {
    const rejected: PromiseLike<any> = Promise.reject(new Error("network down"));
    const res = await safeQuery("net", rejected);
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/kunne ikke hente/i);
    expect(res.error).not.toMatch(/network down/);
  });
});

describe("aggregateError", () => {
  it("returns null when no slice failed", () => {
    expect(aggregateError([null, null, null])).toBeNull();
  });

  it("returns full-failure message when every slice failed", () => {
    expect(aggregateError(["a", "b"])).toMatch(/Tjek din forbindelse/);
  });

  it("returns partial message when some slices failed", () => {
    expect(aggregateError([null, "b", null])).toMatch(/genindlæse/);
  });
});
