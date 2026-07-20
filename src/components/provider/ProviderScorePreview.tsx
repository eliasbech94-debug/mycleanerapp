import { TrendingUp, Trophy } from "lucide-react";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

const TIER_ORDER = ["new", "verified", "experienced", "top_rated", "elite", "partner"] as const;
type Tier = (typeof TIER_ORDER)[number];

const TIER_LABEL: Record<Tier, string> = {
  new: "Ny",
  verified: "Verificeret",
  experienced: "Erfaren",
  top_rated: "Top rated",
  elite: "Elite",
  partner: "Partner",
};

const TIER_REQ: Record<Tier, { jobs: number; rating: number; cancel: number }> = {
  new: { jobs: 0, rating: 0, cancel: 100 },
  verified: { jobs: 3, rating: 4.5, cancel: 10 },
  experienced: { jobs: 15, rating: 4.6, cancel: 8 },
  top_rated: { jobs: 40, rating: 4.7, cancel: 5 },
  elite: { jobs: 100, rating: 4.8, cancel: 3 },
  partner: { jobs: 250, rating: 4.9, cancel: 2 },
};

type Perf = {
  completed_jobs?: number;
  avg_rating?: number;
  cancellation_rate?: number;
  repeat_rate?: number;
};

export function ProviderScorePreview({
  score = 0,
  tier = "new",
  performance = {},
}: {
  score?: number;
  tier?: Tier;
  performance?: Perf;
}) {
  const idx = TIER_ORDER.indexOf(tier);
  const nextTier = idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
  const req = nextTier ? TIER_REQ[nextTier] : null;

  const jobs = performance.completed_jobs ?? 0;
  const rating = performance.avg_rating ?? 0;
  const cancel = performance.cancellation_rate ?? 0;

  return (
    <div className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.ink}22` }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: C.teal }}>
            Marketplace Score
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="font-display text-4xl" style={{ color: C.ink }}>{score}</div>
            <div className="text-xs opacity-60">/ 100</div>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]"
               style={{ background: C.mint, color: C.ink }}>
            <Trophy className="h-3.5 w-3.5" /> {TIER_LABEL[tier]}
          </div>
        </div>
        <TrendingUp className="h-6 w-6 opacity-40" />
      </div>

      <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: C.cream }}>
        <div className="font-bold uppercase tracking-wider opacity-70">Sådan beregnes din score</div>
        <ul className="mt-2 list-disc pl-4 space-y-0.5 opacity-80">
          <li>Gennemførte jobs (30%)</li>
          <li>Gennemsnitlig rating (30%)</li>
          <li>Lav afbestillingsrate (20%)</li>
          <li>Tilbagevendende kunder (20%)</li>
        </ul>
      </div>

      {req && (
        <div className="mt-3 rounded-xl border p-3 text-xs" style={{ borderColor: `${C.ink}22` }}>
          <div className="font-bold uppercase tracking-wider opacity-70">
            Næste tier: {TIER_LABEL[nextTier!]}
          </div>
          <ul className="mt-2 space-y-1">
            <li>• {Math.max(0, req.jobs - jobs)} flere gennemførte jobs</li>
            <li>• Rating over {req.rating.toFixed(1)} (nu {rating.toFixed(1)})</li>
            <li>• Afbestillinger under {req.cancel}% (nu {cancel.toFixed(1)}%)</li>
          </ul>
        </div>
      )}
    </div>
  );
}
