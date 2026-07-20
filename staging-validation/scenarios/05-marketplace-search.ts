// Correctness + timing for search_marketplace_providers_v1.
import { anon, psqlJson } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";

export async function scenarioMarketplaceSearch() {
  return runScenario("05-marketplace-search", "Marketplace search correctness + p95 timing", async (ctx) => {
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = Date.now();
      const { data, error } = await anon.rpc("search_marketplace_providers_v1", {
        _country: "DK", _services: ["cleaning"], _limit: 20, _offset: 0,
      } as any);
      const ms = Date.now() - t0;
      timings.push(ms);
      if (error && i === 0) throw new Error(`RPC error: ${error.message}`);
      if (i === 0) saveJson("marketplace/first-response.json", data);
    }
    attach(ctx, "marketplace/first-response.json");
    const sorted = [...timings].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    saveJson("marketplace/timings.json", { timings, p50, p95, min: sorted[0], max: sorted.at(-1) });
    attach(ctx, "marketplace/timings.json");
    assert(ctx, "p95 < 800ms", p95 < 800, `p95=${p95}ms`);

    // Correctness: no draft/suspended providers leak.
    const [{ n }] = psqlJson<{ n: number }>(
      `select count(*)::int as n from public.public_provider_marketplace where status <> 'active'`,
    );
    assert(ctx, "no non-active in public view", n === 0, `leaked=${n}`);
  });
}
