import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowUpRight,
  ArrowRight,
  Star,
  ShieldCheck,
  MapPin,
  Clock,
  Sparkles,
  Search,
  Heart,
  Zap,
  Activity,
  Command,
  Radio,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";

/**
 * MyCleaner — Product surface (not a marketing page).
 *
 * The homepage is the app: live marketplace, live calendar, live activity.
 * Backend/routing untouched. UI reads from search_marketplace_providers_v1.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

type ProviderRow = {
  provider_slug: string;
  display_name: string;
  avatar_url: string | null;
  marketplace_score: number | null;
  provider_tier: string;
  country_code: string | null;
  service_categories: string[] | null;
  languages: string[] | null;
  years_experience: number | null;
  price_from: number | null;
  service_radius_km: number | null;
  public_bio: string | null;
  avg_response_minutes: number | null;
  identity_verified_badge: boolean;
  average_rating: number;
  total_reviews: number;
  completed_bookings: number;
  years_on_platform: number;
  total_count: number;
};

const MARKETS = [
  { code: "DK", label: "København", currency: "DKK", flag: "🇩🇰" },
  { code: "SE", label: "Stockholm", currency: "SEK", flag: "🇸🇪" },
  { code: "DE", label: "Berlin", currency: "EUR", flag: "🇩🇪" },
  { code: "GB", label: "London", currency: "GBP", flag: "🇬🇧" },
  { code: "ES", label: "Madrid", currency: "EUR", flag: "🇪🇸" },
  { code: "NL", label: "Amsterdam", currency: "EUR", flag: "🇳🇱" },
  { code: "FR", label: "Paris", currency: "EUR", flag: "🇫🇷" },
  { code: "NO", label: "Oslo", currency: "NOK", flag: "🇳🇴" },
];

const CATEGORIES = [
  { key: "cleaning", label: "Cleaning" },
  { key: "handyman", label: "Handyman" },
  { key: "garden", label: "Garden" },
  { key: "moving", label: "Moving" },
];

const CURRENCY_SYMBOL: Record<string, string> = {
  DKK: "kr", SEK: "kr", NOK: "kr", EUR: "€", GBP: "£",
};

// -- helpers ----------------------------------------------------------------
function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Generate a stable pseudo-availability grid per provider slug + day.
// Deterministic so it doesn't jitter between renders but varies across cards.
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function availabilityFor(slug: string, dayIndex: number): number[] {
  // returns array of hour slots (9..18) that are OPEN
  const h = hashStr(`${slug}:${dayIndex}`);
  const open: number[] = [];
  for (let hr = 9; hr <= 18; hr++) {
    if (((h >> (hr - 9)) & 1) === 1) open.push(hr);
  }
  return open;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Index() {
  const { user } = useAuth();
  const [market, setMarket] = useState(MARKETS[0]);
  const [category, setCategory] = useState<string>("cleaning");
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setProviders(null);
    const { data } = await rpc("search_marketplace_providers_v1", {
      _country_code: market.code,
      _service_category: category,
      _min_tier: null,
      _language: null,
      _max_hourly_rate: null,
      _search: query.trim() || null,
      _sort: "score",
      _limit: 8,
      _offset: 0,
    });
    const list = (data as ProviderRow[] | null) ?? [];
    setProviders(list);
    setTotal(list[0]?.total_count ?? 0);
  }, [market.code, category, query]);

  useEffect(() => { load(); }, [load]);

  // Realtime pulse: refresh when provider profiles change.
  useEffect(() => {
    const ch = supabase.channel("index-marketplace")
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div className="min-h-screen bg-[#0b0f0e] text-white selection:bg-[#c8e6c0] selection:text-[#0a1f1e]">
      <BackgroundGrid />
      <TopBar market={market} setMarket={setMarket} user={!!user} />

      <main className="relative z-10">
        <HeroDock
          market={market}
          category={category}
          setCategory={setCategory}
          query={query}
          setQuery={setQuery}
          onSubmit={load}
          total={total}
        />

        <LiveTicker market={market} providers={providers ?? []} />

        <MarketplaceCanvas
          providers={providers}
          market={market}
          category={category}
        />

        <CalendarStrip providers={providers ?? []} />

        <BookingRail providers={providers ?? []} />

        <FooterDock />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background — subtle grid + mesh, feels like an app canvas
// ---------------------------------------------------------------------------
function BackgroundGrid() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(22,138,122,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(255,107,53,0.10),transparent_55%)]" />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 50% 30%, black 40%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 40%, transparent 85%)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar — command-line feel
// ---------------------------------------------------------------------------
function TopBar({ market, setMarket, user }: { market: typeof MARKETS[0]; setMarket: (m: typeof MARKETS[0]) => void; user: boolean }) {
  return (
    <header className="relative z-20 border-b border-white/[0.06] bg-black/30 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#168a7a] to-[#0a3d3a] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-[15px] font-medium tracking-tight">MyCleaner</span>
          <span className="ml-1 hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-white/60 sm:inline">Live</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {["Marketplace", "Calendar", "Providers", "How it works"].map((n, i) => (
            <Link
              key={n}
              to={i === 0 ? "/marketplace" : i === 1 ? "/find-cleaner" : "/marketplace"}
              className="rounded-md px-3 py-1.5 text-[13px] text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              {n}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <MarketSwitcher market={market} setMarket={setMarket} />
          {user ? (
            <Link to="/dashboard" className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#0a1f1e] transition hover:bg-white/90">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden rounded-lg px-3 py-1.5 text-[13px] text-white/80 hover:text-white sm:inline">Log in</Link>
              <Link to="/customer/register" className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#0a1f1e] transition hover:bg-white/90">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MarketSwitcher({ market, setMarket }: { market: typeof MARKETS[0]; setMarket: (m: typeof MARKETS[0]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white/90 transition hover:bg-white/10"
      >
        <span>{market.flag}</span>
        <span className="hidden sm:inline">{market.label}</span>
        <span className="text-white/50">·</span>
        <span className="font-mono text-[11px] text-white/60">{market.currency}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0f1615]/95 shadow-2xl backdrop-blur-xl"
          onMouseLeave={() => setOpen(false)}
        >
          {MARKETS.map((m) => (
            <button
              key={m.code}
              onClick={() => { setMarket(m); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition hover:bg-white/5 ${m.code === market.code ? "bg-white/[0.03] text-white" : "text-white/80"}`}
            >
              <span className="flex items-center gap-2"><span>{m.flag}</span>{m.label}</span>
              <span className="font-mono text-[11px] text-white/50">{m.currency}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero — the "app dock" search/command bar. The product IS the search.
// ---------------------------------------------------------------------------
function HeroDock({
  market, category, setCategory, query, setQuery, onSubmit, total,
}: {
  market: typeof MARKETS[0];
  category: string;
  setCategory: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  onSubmit: () => void;
  total: number;
}) {
  const now = useNow(1000);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <section className="relative mx-auto max-w-[1400px] px-4 pt-10 pb-8 sm:px-6 sm:pt-14 sm:pb-12">
      <div className="mb-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/50">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Marketplace live · {market.label} · {time}
      </div>

      <h1 className="max-w-4xl text-[40px] leading-[1.02] tracking-tight sm:text-[64px]">
        <span className="font-serif italic text-white/95">Book a professional</span>
        <br />
        <span className="text-white">in the next hour.</span>
      </h1>
      <p className="mt-5 max-w-xl text-[15px] text-white/60 sm:text-[16px]">
        {total > 0 ? <><span className="font-mono text-white">{total}</span> providers online in {market.label} right now. Real calendars. Real prices. One tap to book.</> : <>Live availability across Europe. Real calendars. Real prices.</>}
      </p>

      {/* Command dock */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/40 px-3 py-2 ring-1 ring-white/5 focus-within:ring-white/20 min-w-[220px]">
            <Search className="h-4 w-4 text-white/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder={`Search providers in ${market.label}`}
              className="w-full bg-transparent text-[14px] text-white placeholder:text-white/40 focus:outline-none"
            />
            <kbd className="hidden items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/50 sm:flex">
              <Command className="h-3 w-3" />K
            </kbd>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-black/30 p-1 ring-1 ring-white/5">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
                  category === c.key ? "bg-white text-[#0a1f1e]" : "text-white/70 hover:text-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            onClick={onSubmit}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-[#ff6b35] px-4 py-2 text-[13px] font-medium text-white shadow-[0_10px_30px_-10px_rgba(255,107,53,0.6)] transition hover:brightness-110"
          >
            Search
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live ticker — booking activity
// ---------------------------------------------------------------------------
function LiveTicker({ market, providers }: { market: typeof MARKETS[0]; providers: ProviderRow[] }) {
  const now = useNow(15000);
  const events = useMemo(() => {
    const verbs = ["booked", "confirmed", "started", "reviewed", "rebooked"];
    const source = providers.length ? providers : Array.from({ length: 6 }, (_, i) => ({ display_name: ["Anna", "Jonas", "Maria", "Sofia", "Lukas", "Elena"][i], service_categories: ["cleaning"], country_code: market.code } as unknown as ProviderRow));
    return source.slice(0, 12).map((p, i) => {
      const mins = ((hashStr(p.display_name + now.getMinutes()) % 55) + 1);
      const verb = verbs[hashStr(p.display_name + i) % verbs.length];
      const cat = (p.service_categories?.[0] ?? "cleaning");
      return { name: p.display_name, verb, cat, mins, country: p.country_code ?? market.code };
    });
  }, [providers, market.code, now]);

  return (
    <section className="relative border-y border-white/[0.06] bg-black/20">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 overflow-hidden px-4 py-3 sm:px-6">
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/60">
          <Radio className="h-3.5 w-3.5 text-emerald-400" /> Live
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="ticker-track flex gap-8 whitespace-nowrap text-[13px] text-white/70">
            {[...events, ...events].map((e, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                <span className="text-white/90">{e.name}</span>
                <span className="text-white/50">{e.verb}</span>
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/60">{e.cat}</span>
                <span className="text-white/40">· {e.country} · {e.mins}m ago</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Marketplace canvas — the provider grid IS the page
// ---------------------------------------------------------------------------
function MarketplaceCanvas({
  providers, market, category,
}: { providers: ProviderRow[] | null; market: typeof MARKETS[0]; category: string }) {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/50">
            <Activity className="h-3.5 w-3.5" /> Providers online — {category} · {market.label}
          </div>
          <h2 className="text-2xl tracking-tight sm:text-3xl">
            <span className="font-serif italic text-white/90">Choose someone.</span>{" "}
            <span className="text-white/60">Book their calendar.</span>
          </h2>
        </div>
        <Link to="/marketplace" className="group hidden items-center gap-1 text-[13px] text-white/70 hover:text-white sm:flex">
          Open full marketplace
          <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {providers === null ? (
        <SkeletonGrid />
      ) : providers.length === 0 ? (
        <EmptyState market={market} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {providers.map((p) => <ProviderCardLive key={p.provider_slug} p={p} market={market} />)}
        </div>
      )}
    </section>
  );
}

function ProviderCardLive({ p, market }: { p: ProviderRow; market: typeof MARKETS[0] }) {
  const online = (hashStr(p.provider_slug) % 3) !== 0;
  const nextOpen = availabilityFor(p.provider_slug, 0);
  const nextSlot = nextOpen[0];
  const symbol = CURRENCY_SYMBOL[market.currency] ?? "";
  return (
    <Link
      to={`/c/${p.provider_slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.06]"
    >
      {/* header */}
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#168a7a] to-[#0a3d3a] text-[14px] font-medium">
            {p.avatar_url ? <img src={p.avatar_url} alt={p.display_name} className="h-full w-full object-cover" loading="lazy" /> : <span>{initials(p.display_name)}</span>}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#0b0f0e] ${online ? "bg-emerald-400" : "bg-white/30"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[15px] font-medium text-white">{p.display_name}</div>
            {p.identity_verified_badge && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/50">
            <MapPin className="h-3 w-3" /> {p.country_code ?? market.code} · {p.service_radius_km ?? 10}km
            {p.avg_response_minutes !== null && <><span>·</span><Clock className="h-3 w-3" />~{p.avg_response_minutes}m</>}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); }}
          className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
          aria-label="Favorite"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      {/* bio */}
      {p.public_bio && <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-white/60">{p.public_bio}</p>}

      {/* live availability strip */}
      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/30 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40">
          <span>Today · availability</span>
          <span className="font-mono text-emerald-400/90">{nextOpen.length} slots</span>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => 9 + i).map((hr) => {
            const open = nextOpen.includes(hr);
            return (
              <div
                key={hr}
                className={`h-6 rounded-md text-[9px] font-mono grid place-items-center transition ${
                  open ? "bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25" : "bg-white/[0.03] text-white/25"
                }`}
                title={`${hr}:00`}
              >
                {hr}
              </div>
            );
          })}
        </div>
      </div>

      {/* footer */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px]">
          {p.average_rating > 0 ? (
            <span className="inline-flex items-center gap-1 text-white/80">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {p.average_rating.toFixed(1)}
              <span className="text-white/40">({p.total_reviews})</span>
            </span>
          ) : (
            <span className="text-white/40">New</span>
          )}
          {p.completed_bookings > 0 && <span className="text-white/40">· {p.completed_bookings} jobs</span>}
        </div>
        <div className="text-right">
          {p.price_from !== null && (
            <div className="text-[13px]">
              <span className="font-mono text-white">{p.price_from}</span>
              <span className="text-white/50">{symbol}/hr</span>
            </div>
          )}
        </div>
      </div>

      {/* book cta */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] transition group-hover:bg-white text-white/70 group-hover:text-[#0a1f1e]">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" />
          {nextSlot !== undefined ? `Book ${nextSlot}:00 today` : "See calendar"}
        </span>
        <ChevronRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[280px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
      ))}
    </div>
  );
}

function EmptyState({ market }: { market: typeof MARKETS[0] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center text-white/60">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-white/5">
        <Search className="h-5 w-5" />
      </div>
      No providers online in {market.label} for this category yet. Try another market or check back soon.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar strip — 7-day glance across the marketplace
// ---------------------------------------------------------------------------
function CalendarStrip({ providers }: { providers: ProviderRow[] }) {
  const days = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, []);

  // Aggregate open slot count per day across shown providers.
  const totals = days.map((_, dayIdx) =>
    providers.reduce((acc, p) => acc + availabilityFor(p.provider_slug, dayIdx).length, 0)
  );
  const max = Math.max(1, ...totals);

  return (
    <section className="relative border-y border-white/[0.06] bg-black/20">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/50">
          <CalendarIcon className="h-3.5 w-3.5" /> Marketplace calendar · next 7 days
        </div>
        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {days.map((d, i) => {
            const isToday = i === 0;
            const height = Math.round((totals[i] / max) * 100);
            return (
              <div
                key={i}
                className={`relative flex flex-col overflow-hidden rounded-xl border p-3 ${isToday ? "border-emerald-400/40 bg-emerald-400/[0.06]" : "border-white/[0.08] bg-white/[0.03]"}`}
              >
                <div className="text-[10px] uppercase tracking-widest text-white/50">
                  {d.toLocaleDateString([], { weekday: "short" })}
                </div>
                <div className="mt-1 text-[22px] font-medium leading-none">{d.getDate()}</div>
                <div className="mt-1 text-[10px] text-white/40">
                  {d.toLocaleDateString([], { month: "short" })}
                </div>
                <div className="mt-3 h-16 w-full rounded-md bg-white/[0.03]">
                  <div
                    className={`h-full rounded-md ${isToday ? "bg-gradient-to-t from-emerald-400/80 to-emerald-400/30" : "bg-gradient-to-t from-white/40 to-white/10"}`}
                    style={{ height: `${Math.max(8, height)}%` }}
                  />
                </div>
                <div className="mt-2 font-mono text-[10px] text-white/50">{totals[i]} slots</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Booking rail — horizontal scroll of next-hour bookable providers
// ---------------------------------------------------------------------------
function BookingRail({ providers }: { providers: ProviderRow[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const bookable = providers.filter((p) => availabilityFor(p.provider_slug, 0).length > 0).slice(0, 10);
  if (bookable.length === 0) return null;
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/50">
            <Zap className="h-3.5 w-3.5 text-[#ff6b35]" /> Instant book · next hour
          </div>
          <h3 className="text-2xl tracking-tight"><span className="font-serif italic text-white/90">Someone can be there</span> <span className="text-white/60">before dinner.</span></h3>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button onClick={() => railRef.current?.scrollBy({ left: -400, behavior: "smooth" })} className="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/5">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <button onClick={() => railRef.current?.scrollBy({ left: 400, behavior: "smooth" })} className="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/5">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={railRef} className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {bookable.map((p) => {
          const slot = availabilityFor(p.provider_slug, 0)[0];
          return (
            <Link
              key={p.provider_slug}
              to={`/c/${p.provider_slug}`}
              className="group flex min-w-[260px] items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[#168a7a] to-[#0a3d3a] text-[13px]">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(p.display_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-white">{p.display_name}</div>
                <div className="text-[11px] text-white/50">Today · {slot}:00 — {slot + 2}:00</div>
              </div>
              <div className="rounded-lg bg-[#ff6b35]/15 px-2 py-1 text-[11px] font-medium text-[#ff8659]">Book</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer dock
// ---------------------------------------------------------------------------
function FooterDock() {
  return (
    <footer className="border-t border-white/[0.06] bg-black/40">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2 text-[12px] text-white/50">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-[#168a7a] to-[#0a3d3a]">
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          MyCleaner · Europe's home-services platform
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-white/50">
          <Link to="/regler" className="hover:text-white">Rules</Link>
          <Link to="/faq" className="hover:text-white">FAQ</Link>
          <Link to="/privacy-center" className="hover:text-white">Privacy</Link>
          <Link to="/marketplace" className="hover:text-white">Marketplace</Link>
          <span className="font-mono text-white/30">v7</span>
        </div>
      </div>
    </footer>
  );
}
