import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Globe2,
  Star,
  UserPlus,
  Wifi,
  Car,
  ThumbsUp,
} from "lucide-react";
import type { Market } from "@/lib/markets";

/**
 * MarketplaceLive
 * Anonymised, rotating marketplace activity feed + live platform metrics.
 * Fully driven by the active Market from ActiveMarketContext — no hardcoded
 * cities, currencies or country names live in this component.
 *
 * When `isNeutral` is true, we render Europe-wide content: cities come from
 * the neutral market's full city pool and metrics show the aggregate, so we
 * never silently default to a single country's data.
 */

const EVENT_TEMPLATES = [
  { kind: "accepted",   icon: CheckCircle2, tone: "teal",   text: (city: string) => `Provider accepted a booking in ${city}` },
  { kind: "available",  icon: Wifi,         tone: "green",  text: (city: string) => `Provider became available in ${city}` },
  { kind: "completed",  icon: ThumbsUp,     tone: "orange", text: (city: string) => `Booking completed in ${city}` },
  { kind: "joined",     icon: UserPlus,     tone: "blue",   text: (city: string) => `New provider joined in ${city}` },
  { kind: "review",     icon: Star,         tone: "orange", text: (city: string) => `Customer left a 5-star review in ${city}` },
  { kind: "travelling", icon: Car,          tone: "teal",   text: (city: string) => `Provider travelling to booking in ${city}` },
  { kind: "online",     icon: Activity,     tone: "green",  text: (city: string) => `Provider is now online in ${city}` },
] as const;

type Event = { id: number; kind: string; text: string; city: string; agoSec: number; icon: typeof CheckCircle2; tone: string };

// deterministic hash → per-market feed remains stable across re-renders
function hash(str: string, seed = 0) {
  let h = seed;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function buildFeed(marketCode: string, cities: string[], count = 6): Event[] {
  const pool = cities.length ? cities : [marketCode];
  const out: Event[] = [];
  for (let i = 0; i < count; i++) {
    const t = EVENT_TEMPLATES[hash(marketCode + i) % EVENT_TEMPLATES.length];
    const city = pool[hash(marketCode + "c" + i) % pool.length];
    out.push({
      id: i,
      kind: t.kind,
      text: t.text(city),
      city,
      agoSec: 8 + (hash(marketCode + "t" + i) % 240),
      icon: t.icon,
      tone: t.tone,
    });
  }
  return out;
}

// deterministic per-market metric snapshot (anonymised demo)
function marketMetrics(code: string, isNeutral: boolean) {
  if (isNeutral) {
    return { online: 1284, bookingsToday: 2531, rating: 4.9, responseMin: 6 };
  }
  const seed = hash(code, 7);
  return {
    online: 60 + (seed % 380),
    bookingsToday: 120 + (seed % 640),
    rating: Math.min(4.7 + ((seed % 30) / 100), 4.99),
    responseMin: 3 + (seed % 9),
  };
}

const toneMap: Record<string, string> = {
  teal:   "bg-[#168a7a]/15 text-[#8fe0d0] ring-[#168a7a]/30",
  green:  "bg-[#4ade80]/15 text-[#8ee9a8] ring-[#4ade80]/30",
  orange: "bg-[#ff6b35]/15 text-[#ffb08a] ring-[#ff6b35]/30",
  blue:   "bg-[#4a8fe8]/15 text-[#a5c8f5] ring-[#4a8fe8]/30",
};

export default function MarketplaceLive({ market, isNeutral = false }: { market: Market; isNeutral?: boolean }) {
  const baseFeed = useMemo(
    () => buildFeed(market.code, market.cities, 6),
    [market.code, market.cities],
  );
  const [tick, setTick] = useState(0);

  // Rotate feed every 3.5s. Reset tick when market changes so the visible
  // window immediately reflects the newly selected country.
  useEffect(() => {
    setTick(0);
    const id = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(id);
  }, [market.code]);

  const visible = useMemo(() => {
    const window: Event[] = [];
    for (let i = 0; i < 4; i++) {
      const src = baseFeed[(tick + i) % baseFeed.length];
      window.push({ ...src, id: tick * 100 + i, agoSec: Math.max(4, src.agoSec - tick * 3) });
    }
    return window;
  }, [baseFeed, tick]);

  const m = useMemo(() => marketMetrics(market.code, isNeutral), [market.code, isNeutral]);
  const inLabel = isNeutral ? "across Europe" : `in ${market.label}`;

  const metrics = [
    { icon: Wifi,         label: "Providers online",   value: m.online.toLocaleString(market.locale),        foot: inLabel.charAt(0).toUpperCase() + inLabel.slice(1) },
    { icon: CheckCircle2, label: "Bookings today",     value: m.bookingsToday.toLocaleString(market.locale), foot: isNeutral ? "European marketplace" : "Local marketplace" },
    { icon: Star,         label: "Average rating",     value: `${m.rating.toFixed(2)}/5`,                    foot: "Verified reviews" },
    { icon: Globe2,       label: "Active markets",     value: "12",                                          foot: "Across Europe" },
    { icon: Clock,        label: "Avg. response time", value: `${m.responseMin} min`,                        foot: "First provider reply" },
  ];

  return (
    <section className="border-t border-white/[0.05] bg-white/[0.015]">
      <div className="mx-auto max-w-[1400px] px-5 py-12 lg:px-8 lg:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.14em] text-white/75">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
              </span>
              Live marketplace · {market.flag} {market.label}
            </div>
            <h2 className="mt-4 font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-white sm:text-[40px]">
              What's happening right now
            </h2>
            <p className="mt-2 max-w-lg text-[14px] text-white/60">
              {isNeutral
                ? "Anonymised, real-time activity across MyCleaner in Europe. Pick a market to see local activity."
                : "Anonymised, real-time activity across MyCleaner. Switch market to see local activity."}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* FEED */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2">
            <ul className="divide-y divide-white/[0.05]">
              {visible.map((e) => {
                const Icon = e.icon;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3.5 animate-fade-in">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ${toneMap[e.tone] ?? toneMap.teal}`}>
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-white">{e.text}</div>
                      <div className="mt-0.5 text-[11.5px] text-white/45">
                        {e.agoSec < 60 ? `${e.agoSec}s ago` : `${Math.floor(e.agoSec / 60)} min ago`}
                      </div>
                    </div>
                    <span className="hidden shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/55 sm:inline-flex">
                      {e.kind}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between px-4 py-3 text-[11.5px] text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Rotating every few seconds
              </span>
              <span>Anonymised · demo activity</span>
            </div>
          </div>

          {/* METRICS */}
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((it, idx) => (
              <div
                key={it.label}
                className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.04] ${
                  idx === metrics.length - 1 ? "col-span-2" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">{it.label}</span>
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.04] text-[#ff6b35]">
                    <it.icon className="h-4 w-4" strokeWidth={2} />
                  </div>
                </div>
                <div className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-white">{it.value}</div>
                <div className="mt-2 text-[11.5px] text-white/50">{it.foot}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
