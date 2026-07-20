import { describe, it, expect, afterEach, vi } from "vitest";
import { dawaProvider, DawaUnavailableError } from "./dawa";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("DAWA provider — automatic-fallback triggers", () => {
  it("throws DawaUnavailableError with reason=server_error on HTTP 503", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("upstream down", { status: 503 }),
    ) as any;
    await expect(dawaProvider.suggest("sonder", undefined)).rejects.toMatchObject({
      name: "DawaUnavailableError",
      reason: "server_error",
      status: 503,
    });
  });

  it("throws DawaUnavailableError with reason=network on fetch rejection", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as any;
    await expect(dawaProvider.suggest("sonder")).rejects.toBeInstanceOf(DawaUnavailableError);
  });

  it("retries once before surfacing the error (2 total attempts)", async () => {
    const spy = vi.fn(async () => new Response("boom", { status: 500 })) as any;
    globalThis.fetch = spy;
    await expect(dawaProvider.suggest("boulevard")).rejects.toBeInstanceOf(DawaUnavailableError);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does NOT throw when DAWA is healthy — normal path returns suggestions", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { tekst: "Sønder Boulevard 18, 1720 København V", adresse: { id: "abc", vejnavn: "Sønder Boulevard", husnr: "18", postnr: "1720", postnrnavn: "København V" } },
        ]),
        { status: 200 },
      ),
    ) as any;
    const items = await dawaProvider.suggest("sonder");
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("dawa");
  });

  it("propagates caller-initiated AbortError without retrying", async () => {
    const spy = vi.fn(async (_url: string, init: RequestInit) => {
      throw new DOMException("aborted", "AbortError");
    }) as any;
    globalThis.fetch = spy;
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(dawaProvider.suggest("x", ctrl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    // Caller cancelled → no retry attempts.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
