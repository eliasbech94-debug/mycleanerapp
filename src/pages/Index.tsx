import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import EuropeBackdrop from "@/components/EuropeBackdrop";
import MarketplaceLive from "@/components/MarketplaceLive";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { MARKETS, type Market } from "@/lib/markets";
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  Globe2,
  Calendar as CalendarIcon,
  ArrowRight,
  Clock,
  Sparkles,
  ChevronDown,
  Users,
  CheckCircle2,
  Lock,
  Headphones,
  XCircle,
  TrendingUp,
  Heart,
  Award,
} from "lucide-react";

/**
 * MyCleaner — Home v2.0
 * All market-derived content (city names, providers, currency, live activity,
 * highlighted map country) comes from ActiveMarketContext. Never hardcode a
 * country here — switch flags flow through setMarket() and every child
 * re-renders from the same source of truth.
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



function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function Index() {
  const { user } = useAuth();
  const { market, isNeutral, setMarket } = useActiveMarket();
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);

  // In neutral mode we query without a country filter so the grid stays populated
  // with Europe-wide results instead of silently defaulting to a specific country.
  const load = useCallback(async () => {
    setProviders(null);
    const { data } = await rpc("search_marketplace_providers_v1", {
      _country_code: isNeutral ? null : market.code,
      _service_category: "cleaning",
      _min_tier: null,
      _language: null,
      _max_hourly_rate: null,
      _search: null,
      _sort: "score",
      _limit: 8,
      _offset: 0,
    });
    setProviders(((data as ProviderRow[] | null) ?? []));
  }, [market.code, isNeutral]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("index-marketplace")
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div className="bg-[#061615] text-white antialiased [font-feature-settings:'ss01','cv11']">
      <Hero market={market} isNeutral={isNeutral} setMarket={setMarket} />
      <CountryStrip market={market} isNeutral={isNeutral} setMarket={setMarket} />
      <ProviderSection providers={providers} market={market} isNeutral={isNeutral} />
      <MarketplaceLive market={market} isNeutral={isNeutral} />
      <StatsBand />
    </div>
  );
}






/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function Hero({ market, isNeutral, setMarket }: { market: Market; isNeutral: boolean; setMarket: (m: Market) => void }) {
  const [tab, setTab] = useState<"book" | "avail" | "again">("book");
  const [where, setWhere] = useState("");

  return (
    <section className="relative overflow-hidden">
      {/* ambient Europe backdrop — highlights active markets, spotlights current selection */}
      <EuropeBackdrop activeCodes={MARKETS.map((m) => m.code)} selectedCode={isNeutral ? undefined : market.code} />


      <div className="relative mx-auto max-w-[1400px] px-5 pb-14 pt-10 lg:px-8 lg:pt-12">
        {/* Content occupies left half; the Europe backdrop naturally shows through on the right */}
        <div className="min-w-0 max-w-[640px] animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.14em] text-white/75 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            </span>
            Europe's cleaning marketplace
          </div>

          <h1 className="mt-6 font-serif text-[44px] leading-[1.02] tracking-[-0.02em] text-white sm:text-[58px] lg:text-[72px]">
            Book your cleaner.
            <br />
            <span className="italic text-white/45">Anywhere</span> <span className="text-white">in Europe.</span>
          </h1>

          <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-white/65">
            The smart marketplace to book trusted, verified cleaners.
            <br className="hidden sm:inline" />
            Transparent prices. Real reviews. Local professionals.
          </p>

          {/* Search card */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5">
              <div className="flex">
                {[
                  { k: "book", label: "Book a cleaner" },
                  { k: "avail", label: "Find availability" },
                ].map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTab(t.k as never)}
                    className={`relative px-1 py-4 text-[13.5px] font-semibold transition first:mr-6 ${
                      tab === t.k ? "text-white" : "text-white/50 hover:text-white/80"
                    }`}
                  >
                    {t.label}
                    {tab === t.k && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#ff6b35]" />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setTab("again")}
                className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white sm:inline-flex"
              >
                <Users className="h-3.5 w-3.5" /> Same cleaner again?
              </button>
            </div>

            <div className="grid grid-cols-2 gap-px bg-white/[0.05] p-px sm:grid-cols-[1.4fr_1fr_1fr_1.1fr_auto]">
              <Field label="Where?" icon={<MapPin className="h-3.5 w-3.5" />}>
                <input
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="City or postcode"
                  className="w-full bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
                />
              </Field>
              <Field label="When?" icon={<CalendarIcon className="h-3.5 w-3.5" />}>
                <input
                  type="date"
                  className="w-full bg-transparent text-[14px] text-white/80 placeholder:text-white/35 focus:outline-none [color-scheme:dark]"
                />
              </Field>
              <Field label="Time" icon={<Clock className="h-3.5 w-3.5" />}>
                <select className="w-full appearance-none bg-transparent text-[14px] text-white/80 focus:outline-none">
                  <option className="bg-[#0b1f1e]">Select time</option>
                  <option className="bg-[#0b1f1e]">08:00</option>
                  <option className="bg-[#0b1f1e]">10:00</option>
                  <option className="bg-[#0b1f1e]">12:00</option>
                  <option className="bg-[#0b1f1e]">14:00</option>
                  <option className="bg-[#0b1f1e]">16:00</option>
                </select>
              </Field>
              <Field label="Service" icon={<Sparkles className="h-3.5 w-3.5" />}>
                <select className="w-full appearance-none bg-transparent text-[14px] text-white/80 focus:outline-none">
                  <option className="bg-[#0b1f1e]">Standard cleaning</option>
                  <option className="bg-[#0b1f1e]">Deep cleaning</option>
                  <option className="bg-[#0b1f1e]">Move in/out</option>
                  <option className="bg-[#0b1f1e]">Office</option>
                </select>
              </Field>
              <Link
                to={`/marketplace${where ? `?q=${encodeURIComponent(where)}` : ""}`}
                className="col-span-2 flex items-center justify-center gap-1.5 bg-[#ff6b35] px-6 py-4 text-[14px] font-semibold text-white transition hover:bg-[#ff5a1f] sm:col-span-1"
              >
                <Search className="h-4 w-4" strokeWidth={2.5} /> Find cleaner
              </Link>
            </div>

            {/* trust row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] px-5 py-3 text-[12px] text-white/60">
              {[
                { i: ShieldCheck, t: "Verified & insured" },
                { i: Lock, t: "Secure payments" },
                { i: Headphones, t: "24/7 support" },
                { i: XCircle, t: "Free cancellation" },
              ].map(({ i: Icon, t }) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-white/50" strokeWidth={2.25} />{t}
                </span>
              ))}
            </div>
          </div>

          {/* Trust indicators — Trustpilot-style rating */}
          <div className="mt-5 flex flex-wrap items-center gap-3 text-[12.5px] text-white/60">
            <span className="font-semibold text-white">Excellent</span>
            <span className="inline-flex gap-0.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="grid h-4 w-4 place-items-center rounded-[3px] bg-[#00b67a]">
                  <Star className="h-2.5 w-2.5 fill-white text-white" />
                </span>
              ))}
            </span>
            <span className="text-white/80"><span className="font-semibold text-white">4.9</span> out of 5</span>
            <span className="text-[#00b67a]">★ 18,400+ reviews</span>
          </div>
        </div>
      </div>

    </section>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="group flex flex-col gap-1 bg-[#0a1f1e] px-4 py-3 transition hover:bg-[#0d2624] focus-within:bg-[#0d2624]">
      <span className="text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</span>
      <span className="flex items-center gap-2 text-white/50">
        {icon}
        {children}
      </span>
    </label>
  );
}

function StatCard({
  label, value, body, foot, icon, badge, accent,
}: {
  label: string;
  value?: React.ReactNode;
  body?: React.ReactNode;
  foot?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  accent?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition hover:border-white/[0.12] hover:bg-white/[0.04]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</span>
        {accent}
        {badge}
      </div>
      {body ? (
        <div className="mt-2">{body}</div>
      ) : (
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="text-[26px] font-semibold leading-none tracking-tight text-white">{value}</div>
          {icon}
        </div>
      )}
      {foot && <div className="mt-2 text-[11.5px]">{foot}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Country strip                                                       */
/* ------------------------------------------------------------------ */
function CountryStrip({ market, isNeutral, setMarket }: { market: Market; isNeutral: boolean; setMarket: (m: Market) => void }) {
  return (
    <section className="border-y border-white/[0.05] bg-white/[0.015]">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 overflow-x-auto px-5 py-4 lg:px-8">
        <div className="flex shrink-0 flex-col text-[10.5px] font-semibold uppercase leading-tight tracking-[0.14em] text-white/45">
          <span>Live in {MARKETS.length}</span>
          <span>European countries</span>
        </div>
        <div className="flex items-center gap-1.5">
          {MARKETS.map((m) => {
            const active = !isNeutral && m.code === market.code;

            return (
              <button
                key={m.code}
                onClick={() => setMarket(m)}
                aria-pressed={active}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                  active
                    ? "border-[#ff6b35]/40 bg-[#ff6b35]/10 text-white"
                    : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="text-[14px] leading-none">{m.flag}</span>{m.label}
              </button>
            );
          })}
        </div>
        <Link to="/marketplace" className="ml-auto hidden shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#ff6b35] hover:text-[#ff8354] sm:inline-flex">
          See all markets <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Provider section                                                    */
/* ------------------------------------------------------------------ */
function ProviderSection({ providers, market, isNeutral }: { providers: ProviderRow[] | null; market: Market; isNeutral: boolean }) {
  const heading = isNeutral ? "Top rated cleaners across Europe" : `Top rated cleaners in ${market.city}`;
  const emptyLabel = isNeutral ? "your area" : market.label;
  return (
    <section className="py-14">
      <div className="mx-auto max-w-[1400px] px-5 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-[32px] leading-tight tracking-[-0.02em] text-white sm:text-[38px]">
              {isNeutral
                ? <>Top rated cleaners <span className="italic text-white/60">across Europe</span></>
                : <>Top rated cleaners in <span className="italic text-white/60">{market.city}</span></>}
            </h2>
            <p className="mt-2 text-[14px] text-white/55">
              Verified professionals. Real reviews. Book with confidence.
            </p>
          </div>
          <Link
            to="/marketplace"
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-white transition hover:border-[#ff6b35]/40 hover:bg-[#ff6b35]/10"
          >
            See all cleaners
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {providers === null
            ? Array.from({ length: 4 }).map((_, i) => <ProviderSkeleton key={i} />)
            : providers.length === 0
            ? (
                <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-[14px] text-white/50">
                  No cleaners yet in {emptyLabel}. Try another market.
                </div>
              )
            : providers.slice(0, 4).map((p) => <ProviderCard key={p.provider_slug} p={p} sym={market.sym} />)}
        </div>
      </div>

      </div>
    </section>
  );
}

function ProviderCard({ p, sym }: { p: ProviderRow; sym: string }) {
  const badges: { label: string; tone: "orange" | "teal" | "blue" }[] = [];
  if (p.marketplace_score && p.marketplace_score >= 80) badges.push({ label: "Top rated", tone: "orange" });
  else if (p.provider_tier === "elite" || p.provider_tier === "top_rated") badges.push({ label: "Super cleaner", tone: "orange" });
  if (p.identity_verified_badge) badges.push({ label: "ID verified", tone: "teal" });
  if (p.completed_bookings >= 50) badges.push({ label: "Background checked", tone: "blue" });

  return (
    <Link
      to={`/c/${p.provider_slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b1f1e] transition hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-[#0a3d3a] to-[#04100f]">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt={p.display_name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[42px] font-semibold text-white/40">
            {initials(p.display_name)}
          </div>
        )}
        <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#4ade80]/95 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#052e1a] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#052e1a]" /> Online
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); }}
          aria-label="Save"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-[15.5px] font-semibold text-white">{p.display_name}</h3>
        </div>
        <div className="mt-1 inline-flex items-center gap-1 text-[12.5px]">
          <Star className="h-3.5 w-3.5 fill-[#ff6b35] text-[#ff6b35]" />
          <span className="font-semibold text-white">{p.average_rating > 0 ? p.average_rating.toFixed(1) : "New"}</span>
          {p.total_reviews > 0 && <span className="text-white/50">({p.total_reviews} reviews)</span>}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[12px] text-white/55">
          <MapPin className="h-3 w-3" />
          {p.country_code ?? "—"} · {p.service_radius_km ?? 10} km
        </div>
        {p.price_from !== null && (
          <div className="mt-1.5 text-[13px] text-white/70">
            From <span className="font-semibold text-white">{p.price_from} {sym}</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.slice(0, 2).map((b) => (
            <span
              key={b.label}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                b.tone === "orange"
                  ? "bg-[#ff6b35]/15 text-[#ffb08a]"
                  : b.tone === "teal"
                  ? "bg-[#168a7a]/20 text-[#8fe0d0]"
                  : "bg-[#4a8fe8]/15 text-[#a5c8f5]"
              }`}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function ProviderSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b1f1e]">
      <div className="aspect-[4/5] animate-pulse bg-white/[0.04]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
        <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stats band                                                          */
/* ------------------------------------------------------------------ */
function StatsBand() {
  const items = [
    { icon: Users, k: "15,000+", v: "Verified cleaners" },
    { icon: CheckCircle2, k: "500,000+", v: "Bookings completed" },
    { icon: Star, k: "4.9/5", v: "Average rating" },
    { icon: Globe2, k: "12", v: "European markets" },
  ];
  return (
    <section className="border-t border-white/[0.05] bg-white/[0.015]">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-4 px-5 py-6 sm:grid-cols-4 lg:px-8">
        {items.map((i) => (
          <div key={i.v} className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-[#ff6b35]">
              <i.icon className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[19px] font-semibold leading-none tracking-tight text-white">{i.k}</div>
              <div className="mt-1 text-[12px] text-white/55">{i.v}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

