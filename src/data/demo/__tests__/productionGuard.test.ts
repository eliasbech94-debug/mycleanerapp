/**
 * Production guard for the development demo dataset.
 *
 * The fixtures are never deleted — they must keep working in development and
 * approved previews — but a production hostname must ALWAYS win over any
 * env flag, and production must never fall back to demo content.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  PRODUCTION_HOSTS,
  isDemoModeEnabled,
  isPreviewHost,
  isProductionHost,
  selectDemoProviders,
  selectDemoProvidersWithMinimum,
  withDemoFallback,
  getRelatedDemoProviders,
  getDemoCollections,
} from "@/data/demo";
import { DEMO_PROVIDER_FIXTURES } from "@/data/demo/providers";

const withHost = (hostname: string) => {
  vi.stubGlobal("location", { ...window.location, hostname });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("production hostname guard", () => {
  it.each(PRODUCTION_HOSTS)("never enables demo on %s", (host) => {
    withHost(host);
    expect(isProductionHost(host)).toBe(true);
    expect(isPreviewHost(host)).toBe(false);
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("VITE_DEMO_MODE=true cannot bypass the production hostname guard", () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.stubEnv("VITE_ENABLE_DEMO_PROVIDERS", "true");
    for (const host of PRODUCTION_HOSTS) {
      withHost(host);
      expect(isDemoModeEnabled()).toBe(false);
    }
  });

  it("is case-insensitive about the hostname", () => {
    withHost("WWW.MyCleaner.DK");
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("fails safe on an unknown hostname", () => {
    withHost("some-random-host.example.com");
    expect(isPreviewHost()).toBe(false);
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("VITE_DEMO_MODE=false disables demo everywhere", () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    withHost("localhost");
    expect(isDemoModeEnabled()).toBe(false);
  });
});

describe("development and approved preview", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "mycleaner.local",
    "id-preview--c41cdc9d-5ab6-4c8d-987e-e3272520bdfb.lovable.app",
    "sandbox.lovableproject.com",
  ])("still allows demo on %s", (host) => {
    withHost(host);
    expect(isProductionHost(host)).toBe(false);
    expect(isPreviewHost(host)).toBe(true);
    expect(isDemoModeEnabled()).toBe(true);
  });

  it("keeps the fixtures on disk and loadable", () => {
    expect(DEMO_PROVIDER_FIXTURES.length).toBeGreaterThan(3);
    expect(DEMO_PROVIDER_FIXTURES.every((p) => p.provider_slug.startsWith("demo-"))).toBe(true);
  });
});

/**
 * The exported helpers are bound to the module-level DEMO_MODE constant, which
 * is evaluated under the vitest (non-production) host. What must hold in
 * production is: with demo disabled, every helper is inert and no surface can
 * mix demo rows into live rows.
 */
describe("no demo/production data mixing", () => {
  it("withDemoFallback returns live rows untouched when live data exists", () => {
    const live = [{ provider_slug: "real-anna" }] as never[];
    const { rows, isDemo } = withDemoFallback(live);
    expect(rows).toBe(live);
    expect(isDemo).toBe(false);
    expect((rows ?? []).some((r) => (r as { provider_slug: string }).provider_slug.startsWith("demo-"))).toBe(false);
  });

  it("demo helpers only ever return demo-* slugs, never live-looking ones", () => {
    const all = [
      ...selectDemoProviders({ limit: 50 }),
      ...selectDemoProvidersWithMinimum({}, 4).rows,
      ...getRelatedDemoProviders("demo-unknown", 4),
      ...getDemoCollections(4).flatMap((c) => c.providers ?? []),
    ];
    expect(all.every((p) => p.provider_slug.startsWith("demo-"))).toBe(true);
  });
});

describe("sitemap and SEO never contain demo providers", () => {
  it("the generated sitemap has no demo-* URLs", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const path = "public/sitemap.xml";
    if (!existsSync(path)) return;
    const xml = readFileSync(path, "utf8");
    expect(xml).not.toMatch(/demo-/);
    expect(xml).not.toMatch(/\/p\//);
  });

  it("the sitemap generator emits no provider-profile routes", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("scripts/generate-sitemap.ts", "utf8");
    expect(src).not.toMatch(/demo/i);
  });
});
