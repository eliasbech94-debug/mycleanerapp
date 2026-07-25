import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  Wallet,
  Globe2,
  Calendar as CalendarIcon,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";

/**
 * MyCleaner — Home v2.
 * Evolution of the current MyCleaner homepage: same DNA (dark green hero,
 * orange accent, pill search, country chips, feature trio, provider grid),
 * refined for spacing, typography, shadows, motion and a11y.
 * Backend & routing untouched.
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
  price_from: number | null;
  service_radius_km: number | null;
  public_bio: string | null;
  avg_response_minutes: number | null;
  identity_verified_badge: boolean;
  average_rating: number;
  total_reviews: number;
  completed_bookings: number;
  total_count: number;
};

const MARKETS = [
  { code: "DK", label: "Danmark", flag: "🇩🇰", currency: "DKK", sym: "kr" },
  { code: "SE", label: "Sverige", flag: "🇸🇪", currency: "SEK", sym: "kr" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧", currency: "GBP", sym: "£" },
  { code: "DE", label: "Deutschland", flag: "🇩🇪", currency: "EUR", sym: "€" },
  { code: "ES", label: "España", flag: "🇪🇸", currency: "EUR", sym: "€" },
];

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function Index() {
  const { user } = useAuth();
  const [market, setMarket] = useState(MARKETS[0]);
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);

  const load = useCallback(async () => {
    setProviders(null);
    const { data } = await rpc("search_marketplace_providers_v1", {
      _country_code: market.code,
      _service_category: "cleaning",
      _min_tier: null,
      _language: null,
      _max_hourly_rate: null,
      _search: query.trim() || null,
      _sort: "score",
      _limit: 8,
      _offset: 0,
    });
    setProviders(((data as ProviderRow[] | null) ?? []));
  }, [market.code, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("index-marketplace")
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-[#0a1f1e]">
      <TopBar user={!!user} market={market} setMarket={setMarket} />
      <Hero
        market={market}
        setMarket={setMarket}
        query={query}
        setQuery={setQuery}
        onSubmit={load}
      />
      <TrustStrip />
      <Features />
      <ProviderSection providers={providers} market={market} />
      <CalendarPreview />
      <CTASection user={!!user} />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */
function TopBar({ user, market, setMarket }: { user: boolean; market: typeof MARKETS[0]; setMarket: (m: typeof MARKETS[0]) => void }) {
  const [openMarket, setOpenMarket] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#0f4d47] to-[#0a3d3a] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_8px_-2px_rgba(10,61,58,0.4)]">
            <Sparkles className="h-4.5 w-4.5 text-white" strokeWidth={2.25} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">MyCleaner</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {[
            { label: "Home", to: "/" },
            { label: "How it works", to: "/faq" },
            { label: "Find Your Cleaner", to: "/marketplace" },
            { label: "About", to: "/faq" },
          ].map((n) => (
            <Link
              key={n.label}
              to={n.to}
              className="rounded-lg px-3 py-2 text-[14px] font-medium text-[#0a1f1e]/70 transition hover:bg-[#0a3d3a]/5 hover:text-[#0a1f1e]"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setOpenMarket((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0a1f1e]/80 transition hover:border-black/20 hover:bg-[#f7f6f2]"
              aria-label="Change country"
            >
              <Globe2 className="h-3.5 w-3.5" />
              <span>{market.flag}</span>
            </button>
            {openMarket && (
              <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-black/[0.06] bg-white p-1 shadow-[0_20px_50px_-20px_rgba(10,31,30,0.25)]" onMouseLeave={() => setOpenMarket(false)}>
                {MARKETS.map((m) => (
                  <button
                    key={m.code}
                    onClick={() => { setMarket(m); setOpenMarket(false); }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-[#f7f6f2] ${m.code === market.code ? "bg-[#f7f6f2] font-medium" : ""}`}
                  >
                    <span className="flex items-center gap-2"><span>{m.flag}</span>{m.label}</span>
                    <span className="font-mono text-[11px] text-[#0a1f1e]/50">{m.currency}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {user ? (
            <Link to="/dashboard" className="rounded-full bg-[#0a3d3a] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0f4d47] hover:shadow-md">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="hidden rounded-full px-3 py-2 text-[13px] font-medium text-[#0a1f1e]/80 hover:text-[#0a1f1e] sm:inline">Log In</Link>
              <Link to="/customer/register" className="rounded-full bg-[#ff6b35] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_4px_12px_-2px_rgba(255,107,53,0.4)] transition hover:bg-[#ff5a1f] hover:shadow-[0_8px_20px_-4px_rgba(255,107,53,0.5)]">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function Hero({
  market, setMarket, query, setQuery, onSubmit,
}: {
  market: typeof MARKETS[0];
  setMarket: (m: typeof MARKETS[0]) => void;
  query: string;
  setQuery: (s: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="relative overflow-hidden bg-[#0a3d3a] text-white">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(22,138,122,0.55),transparent_55%),radial-gradient(ellipse_at_85%_100%,rgba(255,107,53,0.20),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 30%, black 40%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 40%, transparent 80%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 md:py-28 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center animate-fade-in">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/80 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c8e6c0] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#c8e6c0]" />
            </span>
            Trusted across Europe
          </div>

          <h1 className="text-balance font-semibold tracking-[-0.02em] text-white text-[40px] leading-[1.05] sm:text-[56px] md:text-[68px]">
            Choose your cleaner,
            <br />
            <span className="text-[#ff6b35]">not just any cleaner.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-white/75 sm:text-[17px]">
            Find trusted, verified cleaning professionals across Europe.
            Browse profiles, compare rates, and book directly.
          </p>

          {/* Search bar */}
          <form
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
            className="mx-auto mt-10 flex w-full max-w-2xl items-center gap-1.5 rounded-full bg-white p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35),0_2px_8px_-2px_rgba(0,0,0,0.2)] ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[#ff6b35]/50"
          >
            <div className="flex flex-1 items-center gap-2 pl-4">
              <Search className="h-4.5 w-4.5 shrink-0 text-[#0a1f1e]/40" strokeWidth={2.25} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter city or postcode…"
                aria-label="Enter city or postcode"
                className="w-full bg-transparent py-2.5 text-[15px] text-[#0a1f1e] placeholder:text-[#0a1f1e]/40 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#ff6b35] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_16px_-4px_rgba(255,107,53,0.5)] transition hover:bg-[#ff5a1f] hover:shadow-[0_10px_24px_-6px_rgba(255,107,53,0.6)] active:scale-[0.98]"
            >
              Search
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Country chips */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {MARKETS.map((m) => {
              const active = m.code === market.code;
              return (
                <button
                  key={m.code}
                  onClick={() => setMarket(m)}
                  aria-label={m.label}
                  aria-pressed={active}
                  className={`grid h-11 w-11 place-items-center rounded-full text-[18px] transition ${
                    active
                      ? "bg-white text-[#0a1f1e] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.4)] scale-110"
                      : "bg-white/[0.08] text-white hover:bg-white/[0.16] hover:scale-105"
                  }`}
                >
                  {m.flag}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Trust strip                                                         */
/* ------------------------------------------------------------------ */
function TrustStrip() {
  const items = [
    { k: "12", v: "Countries" },
    { k: "3,800+", v: "Verified cleaners" },
    { k: "4.9", v: "Average rating" },
    { k: "< 5 min", v: "Response time" },
  ];
  return (
    <section className="border-b border-black/[0.05] bg-[#faf9f5]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6 lg:px-8">
        {items.map((i) => (
          <div key={i.v} className="text-center sm:text-left">
            <div className="text-[22px] font-semibold tracking-tight text-[#0a1f1e] sm:text-[26px]">{i.k}</div>
            <div className="mt-0.5 text-[12.5px] font-medium uppercase tracking-wider text-[#0a1f1e]/50">{i.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */
function Features() {
  const items = [
    {
      icon: ShieldCheck,
      title: "Verified cleaners",
      body: "Identity, insurance and references checked before profiles go live.",
    },
    {
      icon: Wallet,
      title: "Transparent pricing",
      body: "See rates upfront. No hidden fees, no surprise invoices.",
    },
    {
      icon: MapPin,
      title: "All across Europe",
      body: "Book locally in 12 countries with your language and currency.",
    },
  ];
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0a3d3a]/[0.06] px-3 py-1 text-[12px] font-medium text-[#0a3d3a]">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome to MyCleaner
          </div>
          <h2 className="mt-5 text-balance text-[32px] font-semibold tracking-[-0.02em] text-[#0a1f1e] sm:text-[40px]">
            Your personal cleaning expert — one tap away
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-[#0a1f1e]/60">
            MyCleaner is a European network of professional cleaners. Create a free account
            to book, message your cleaner and keep track of your appointments.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_0_rgba(10,31,30,0.03),0_1px_2px_rgba(10,31,30,0.04)] transition hover:-translate-y-0.5 hover:border-[#0a3d3a]/15 hover:shadow-[0_20px_40px_-20px_rgba(10,61,58,0.2)]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#0f4d47] to-[#0a3d3a] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <it.icon className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <h3 className="mt-5 text-[17px] font-semibold text-[#0a1f1e]">{it.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#0a1f1e]/60">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Provider section (marketplace-first)                                */
/* ------------------------------------------------------------------ */
function ProviderSection({ providers, market }: { providers: ProviderRow[] | null; market: typeof MARKETS[0] }) {
  return (
    <section className="bg-[#faf9f5] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wider text-[#0a3d3a]/70">Marketplace</div>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-[#0a1f1e] sm:text-[34px]">
              Cleaners available in <span className="text-[#0a3d3a]">{market.label}</span>
            </h2>
          </div>
          <Link
            to="/marketplace"
            className="group inline-flex items-center gap-1.5 rounded-full border border-[#0a3d3a]/15 bg-white px-4 py-2 text-[13px] font-semibold text-[#0a3d3a] transition hover:border-[#0a3d3a]/30 hover:bg-[#0a3d3a] hover:text-white"
          >
            View all
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {providers === null
            ? Array.from({ length: 4 }).map((_, i) => <ProviderSkeleton key={i} />)
            : providers.length === 0
            ? (
                <div className="col-span-full rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center text-[14px] text-[#0a1f1e]/50">
                  No cleaners yet in {market.label}. Try another country.
                </div>
              )
            : providers.slice(0, 4).map((p) => <ProviderCard key={p.provider_slug} p={p} sym={market.sym} />)}
        </div>
      </div>
    </section>
  );
}

function ProviderCard({ p, sym }: { p: ProviderRow; sym: string }) {
  return (
    <Link
      to={`/c/${p.provider_slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_0_rgba(10,31,30,0.03)] transition hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(10,61,58,0.25)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#e8f2f0] to-[#d1e6e2]">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt={p.display_name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[36px] font-semibold text-[#0a3d3a]/60">
            {initials(p.display_name)}
          </div>
        )}
        {p.identity_verified_badge && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-[#0a3d3a] shadow-sm backdrop-blur">
            <ShieldCheck className="h-3 w-3" /> Verified
          </div>
        )}
        {p.price_from !== null && (
          <div className="absolute bottom-3 right-3 rounded-full bg-[#0a1f1e]/85 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur">
            from {p.price_from} {sym}/hr
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-[15.5px] font-semibold text-[#0a1f1e]">{p.display_name}</h3>
          {p.average_rating > 0 && (
            <div className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-[#0a1f1e]">
              <Star className="h-3.5 w-3.5 fill-[#ff6b35] text-[#ff6b35]" />
              {p.average_rating.toFixed(1)}
              <span className="text-[#0a1f1e]/40">({p.total_reviews})</span>
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[12.5px] text-[#0a1f1e]/55">
          <MapPin className="h-3 w-3" />
          {p.country_code ?? "—"} · {p.service_radius_km ?? 10} km
        </div>
        {p.public_bio && (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#0a1f1e]/60">{p.public_bio}</p>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1 text-[#0a1f1e]/55">
            <Clock className="h-3 w-3" />
            {p.avg_response_minutes !== null ? `~${p.avg_response_minutes} min` : "Fast reply"}
          </span>
          <span className="font-medium text-[#0a3d3a] transition group-hover:text-[#ff6b35]">
            Book →
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProviderSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white">
      <div className="aspect-[4/3] animate-pulse bg-[#e8f2f0]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-[#e8f2f0]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[#eef1f0]" />
        <div className="h-3 w-full animate-pulse rounded bg-[#eef1f0]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar-first preview                                              */
/* ------------------------------------------------------------------ */
function CalendarPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date().getDay();
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0a3d3a]/[0.06] px-3 py-1 text-[12px] font-medium text-[#0a3d3a]">
            <CalendarIcon className="h-3.5 w-3.5" />
            Calendar-first booking
          </div>
          <h2 className="mt-5 text-balance text-[32px] font-semibold tracking-[-0.02em] text-[#0a1f1e] sm:text-[40px]">
            Book directly in your cleaner's calendar
          </h2>
          <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-[#0a1f1e]/60">
            No bidding. No waiting. Pick a slot that fits both of you and confirm in
            seconds — the cleaner sees your booking immediately.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/marketplace" className="inline-flex items-center gap-1.5 rounded-full bg-[#0a3d3a] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#0f4d47] hover:shadow-md">
              Browse cleaners <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/find-cleaner" className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0a1f1e] transition hover:border-black/20 hover:bg-[#faf9f5]">
              Map view
            </Link>
          </div>
        </div>

        <div className="relative">
          <div aria-hidden className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-[#e8f2f0] via-transparent to-[#fff0e8] opacity-60 blur-2xl" />
          <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_30px_80px_-30px_rgba(10,61,58,0.3)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[#0a1f1e]">This week</div>
              <div className="text-[12px] text-[#0a1f1e]/50">Live availability</div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d, i) => {
                const isToday = ((i + 1) % 7) === today;
                return (
                  <div key={d} className={`rounded-xl border p-2 text-center transition ${
                    isToday ? "border-[#0a3d3a] bg-[#0a3d3a] text-white" : "border-black/[0.06] bg-[#faf9f5] text-[#0a1f1e]/70"
                  }`}>
                    <div className="text-[10.5px] font-medium uppercase tracking-wider opacity-70">{d}</div>
                    <div className="mt-0.5 text-[16px] font-semibold">{i + 8}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 space-y-1.5">
              {[
                { t: "09:00 – 11:00", who: "Maria S.", tag: "Verified" },
                { t: "13:30 – 15:30", who: "Anders K.", tag: "Top rated" },
                { t: "16:00 – 18:00", who: "Sofia L.", tag: "New" },
              ].map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-black/[0.05] bg-white p-3 transition hover:border-[#0a3d3a]/20 hover:bg-[#faf9f5]"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0a3d3a]/[0.08] text-[11px] font-bold text-[#0a3d3a]">
                      {s.who.split(" ").map((x) => x[0]).join("")}
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold text-[#0a1f1e]">{s.t}</div>
                      <div className="text-[11.5px] text-[#0a1f1e]/55">{s.who} · {s.tag}</div>
                    </div>
                  </div>
                  <button className="rounded-full bg-[#ff6b35] px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-[#ff5a1f]">
                    Book
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CTA                                                                 */
/* ------------------------------------------------------------------ */
function CTASection({ user }: { user: boolean }) {
  return (
    <section className="bg-[#faf9f5] py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#0a3d3a] p-10 text-center text-white shadow-[0_30px_80px_-30px_rgba(10,61,58,0.5)] sm:p-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_120%,rgba(255,107,53,0.35),transparent_55%),radial-gradient(ellipse_at_20%_-10%,rgba(22,138,122,0.4),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-balance text-[32px] font-semibold tracking-[-0.02em] sm:text-[42px]">
              Ready to meet your cleaner?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15.5px] leading-relaxed text-white/75">
              Join thousands of households across Europe who chose their cleaner —
              not just any cleaner.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={user ? "/marketplace" : "/customer/register"}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#ff6b35] px-6 py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-6px_rgba(255,107,53,0.6)] transition hover:bg-[#ff5a1f] hover:shadow-[0_14px_30px_-8px_rgba(255,107,53,0.7)]"
              >
                {user ? "Find a cleaner" : "Get started free"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/provider/register"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-6 py-3 text-[14.5px] font-semibold text-white backdrop-blur transition hover:bg-white/[0.14]"
              >
                Become a cleaner
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-black/[0.06] bg-white py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-[13px] text-[#0a1f1e]/55">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-[#0f4d47] to-[#0a3d3a] text-white">
            <Sparkles className="h-3 w-3" />
          </div>
          © {new Date().getFullYear()} MyCleaner. All rights reserved.
        </div>
        <div className="flex items-center gap-5 text-[13px] text-[#0a1f1e]/60">
          <Link to="/faq" className="hover:text-[#0a3d3a]">FAQ</Link>
          <Link to="/regler" className="hover:text-[#0a3d3a]">Terms</Link>
          <Link to="/privacy-center" className="hover:text-[#0a3d3a]">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
