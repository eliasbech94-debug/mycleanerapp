import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Star,
  ShieldCheck,
  Calendar,
  MapPin,
  Search,
  Clock,
  Sparkles,
  Languages,
  Globe2,
  Lock,
  Zap,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";

/**
 * MyCleaner — European marketplace landing page.
 *
 * Design language: precise, technical, trustworthy. Inspired by
 * Stripe (grid + mono numerals), Apple (typographic scale + calm),
 * Uber (search-first hero), Revolut (multi-currency clarity).
 *
 * MyCleaner identity preserved: deep teal + warm accent, editorial serif.
 * All UI only — no changes to routes, auth or data flows.
 */

// ---------------------------------------------------------------------------
// Palette — MyCleaner identity, evolved for a European tech marketplace.
// Deep teal + cream retained. Warm ember accent. Precise neutral scale.
// ---------------------------------------------------------------------------
const C = {
  bg: "#f7f5f0",           // warm off-white canvas
  paper: "#ffffff",
  cream: "#f0ebe0",
  line: "#e5e0d3",
  hairline: "#eae5d8",
  ink: "#0a1f1e",          // near-black teal
  teal: "#0a3d3a",         // brand deep teal
  tealSoft: "#168a7a",
  mint: "#c8e6c0",
  ember: "#ff6b35",        // brand warm accent
  amber: "#f5a623",
  muted: "#5a655f",
  subtle: "#8a938c",
};

// Trust metrics — placeholders until wired to live analytics.
const TRUST = {
  rating: "4.9",
  reviewCount: "18,400+",
  cleanerCount: "6,200+",
  bookedThisWeek: "9,300",
  countries: 12,
};

// Supported markets — surfaces European scale in the UI.
const MARKETS = [
  { code: "DK", city: "København", currency: "DKK", flag: "🇩🇰" },
  { code: "SE", city: "Stockholm", currency: "SEK", flag: "🇸🇪" },
  { code: "DE", city: "Berlin", currency: "EUR", flag: "🇩🇪" },
  { code: "NL", city: "Amsterdam", currency: "EUR", flag: "🇳🇱" },
  { code: "FR", city: "Paris", currency: "EUR", flag: "🇫🇷" },
  { code: "ES", city: "Madrid", currency: "EUR", flag: "🇪🇸" },
  { code: "IT", city: "Milano", currency: "EUR", flag: "🇮🇹" },
  { code: "PL", city: "Warszawa", currency: "PLN", flag: "🇵🇱" },
];

const PROVIDERS = [
  {
    id: "p_001",
    name: "Sofia Møller",
    initials: "SM",
    city: "København",
    country: "DK",
    flag: "🇩🇰",
    rating: 4.95,
    reviews: 142,
    verified: true,
    languages: ["DA", "EN"],
    experience: "6 år",
    priceFrom: 280,
    currency: "DKK",
    responseTime: "~12 min",
    tagline: "Grundig, diskret og med sans for detaljen.",
  },
  {
    id: "p_002",
    name: "Anna Lindqvist",
    initials: "AL",
    city: "Stockholm",
    country: "SE",
    flag: "🇸🇪",
    rating: 4.92,
    reviews: 96,
    verified: true,
    languages: ["SV", "EN", "DA"],
    experience: "4 år",
    priceFrom: 320,
    currency: "SEK",
    responseTime: "~20 min",
    tagline: "Miljövänliga produkter och en stadig rytm.",
  },
  {
    id: "p_003",
    name: "Lukas Weber",
    initials: "LW",
    city: "Berlin",
    country: "DE",
    flag: "🇩🇪",
    rating: 4.88,
    reviews: 210,
    verified: true,
    languages: ["DE", "EN"],
    experience: "8 år",
    priceFrom: 32,
    currency: "EUR",
    responseTime: "~8 min",
    tagline: "Gründlich, pünktlich, mit klarem Prozess.",
  },
];

// ---------------------------------------------------------------------------
// Navigation — sticky, precise, with a compact market switcher.
// ---------------------------------------------------------------------------
function Nav() {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{ background: `${C.bg}cc`, borderBottom: `1px solid ${C.line}` }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg font-serif text-base"
            style={{ background: C.teal, color: C.bg }}
          >
            M
          </span>
          <span className="font-serif text-[19px] tracking-tight" style={{ color: C.ink }}>
            MyCleaner
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex" style={{ color: C.muted }}>
          <Link to="/find-cleaner" className="transition-colors hover:text-[--ink]" style={{ ["--ink" as string]: C.ink }}>
            Find a cleaner
          </Link>
          <Link to="/regler" className="transition-colors hover:text-[--ink]" style={{ ["--ink" as string]: C.ink }}>
            How it works
          </Link>
          <Link to="/provider/register" className="transition-colors hover:text-[--ink]" style={{ ["--ink" as string]: C.ink }}>
            For providers
          </Link>
          <Link to="/faq" className="transition-colors hover:text-[--ink]" style={{ ["--ink" as string]: C.ink }}>
            Enterprise
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white sm:inline-flex"
            style={{ borderColor: C.line, color: C.ink }}
          >
            <Globe2 className="h-3.5 w-3.5" style={{ color: C.tealSoft }} />
            EN · EUR
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <Link
            to="/login"
            className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
            style={{ color: C.ink }}
          >
            Sign in
          </Link>
          <Link
            to="/customer/register"
            className="hidden items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition-all hover:opacity-90 sm:inline-flex"
            style={{ background: C.ink, color: C.bg }}
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero — editorial headline, precision grid backdrop, dual CTAs.
// ---------------------------------------------------------------------------
function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.bg }}>
      {/* Precision grid backdrop — Stripe-style */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to right, ${C.line} 1px, transparent 1px),
            linear-gradient(to bottom, ${C.line} 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
        }}
      />
      {/* Warm ambient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-20 h-[440px] w-[440px] rounded-full blur-3xl"
        style={{ background: C.mint, opacity: 0.35 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-40 h-[360px] w-[360px] rounded-full blur-3xl"
        style={{ background: C.ember, opacity: 0.1 }}
      />

      <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pt-20 md:pb-20 md:pt-24">
        {/* Live badge */}
        <div
          className="mx-auto flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide animate-[fade-in_0.6s_ease-out]"
          style={{ borderColor: C.line, color: C.muted, background: `${C.paper}` }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: C.tealSoft }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: C.tealSoft }} />
          </span>
          Live in {TRUST.countries} European markets
        </div>

        <h1
          className="mx-auto mt-6 max-w-5xl text-center font-serif leading-[0.98] tracking-[-0.02em] animate-[fade-in_0.8s_ease-out]"
          style={{ color: C.ink, fontSize: "clamp(2.6rem, 7.6vw, 5.8rem)" }}
        >
          Home services,{" "}
          <span className="italic" style={{ color: C.tealSoft }}>
            engineered
          </span>{" "}
          for Europe.
        </h1>

        <p
          className="mx-auto mt-6 max-w-2xl text-center text-[17px] leading-relaxed sm:text-[18px] animate-[fade-in_0.9s_ease-out]"
          style={{ color: C.muted }}
        >
          Book vetted, insured providers across 12 countries. Transparent local pricing,
          escrowed payments, and a single account for every European market.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-[fade-in_1s_ease-out]">
          <Link
            to="/find-cleaner"
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(10,31,30,0.35)]"
            style={{ background: C.ink, color: C.bg }}
          >
            Book a cleaner
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <Link
            to="/provider/register"
            className="inline-flex items-center gap-2 rounded-full border bg-white px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ borderColor: C.line, color: C.ink }}
          >
            Start earning as a provider
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Trust row */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm" style={{ color: C.muted }}>
          <div className="inline-flex items-center gap-2">
            <div className="flex" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3.5 w-3.5" style={{ color: C.amber }} fill={C.amber} />
              ))}
            </div>
            <span>
              <span className="font-semibold tabular-nums" style={{ color: C.ink }}>
                {TRUST.rating}
              </span>{" "}
              · <span className="tabular-nums">{TRUST.reviewCount}</span> reviews
            </span>
          </div>
          <div className="hidden h-4 w-px sm:block" style={{ background: C.line }} />
          <div className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" style={{ color: C.tealSoft }} />
            KYC verified · Insured
          </div>
          <div className="hidden h-4 w-px sm:block" style={{ background: C.line }} />
          <div className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" style={{ color: C.tealSoft }} />
            PSD2 · GDPR compliant
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Search — the hero of the marketplace. Uber-style precision, multi-market.
// ---------------------------------------------------------------------------
function SearchPanel() {
  const [type, setType] = useState("standard");
  const [market, setMarket] = useState("DK");
  return (
    <section className="relative -mt-8 px-5 pb-20 sm:px-8 md:-mt-16" style={{ background: C.bg }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          window.location.assign("/find-cleaner");
        }}
        className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border bg-white shadow-[0_30px_80px_-30px_rgba(10,31,30,0.35)]"
        style={{ borderColor: C.line }}
      >
        {/* Market bar */}
        <div
          className="flex items-center justify-between gap-4 border-b px-5 py-3 text-xs"
          style={{ borderColor: C.hairline, color: C.muted, background: C.bg }}
        >
          <div className="flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5" style={{ color: C.tealSoft }} />
            <span className="font-medium uppercase tracking-[0.14em]">Market</span>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="rounded-full border bg-white px-2.5 py-1 text-xs font-medium focus:outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            >
              {MARKETS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.flag} {m.city} · {m.currency}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden items-center gap-4 tabular-nums sm:flex">
            <span>Avg. response <span className="font-semibold" style={{ color: C.ink }}>14 min</span></span>
            <span className="h-3 w-px" style={{ background: C.line }} />
            <span>Booked today <span className="font-semibold" style={{ color: C.ink }}>1,428</span></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1.1fr_auto]">
          <Field icon={<MapPin className="h-4 w-4" />} label="Address">
            <input
              type="text"
              defaultValue="Vesterbrogade 12, 1620 København"
              placeholder="Street, city or postal code"
              className="w-full bg-transparent text-sm font-medium focus:outline-none"
              style={{ color: C.ink }}
            />
          </Field>
          <Field icon={<Calendar className="h-4 w-4" />} label="Date" divider>
            <input
              type="date"
              className="w-full bg-transparent text-sm font-medium focus:outline-none"
              style={{ color: C.ink }}
            />
          </Field>
          <Field icon={<Clock className="h-4 w-4" />} label="Time" divider>
            <select className="w-full bg-transparent text-sm font-medium focus:outline-none" style={{ color: C.ink }}>
              <option>Morning · 08–11</option>
              <option>Midday · 11–14</option>
              <option>Afternoon · 14–17</option>
              <option>Evening · 17–20</option>
            </select>
          </Field>
          <Field icon={<Sparkles className="h-4 w-4" />} label="Service" divider>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-transparent text-sm font-medium focus:outline-none"
              style={{ color: C.ink }}
            >
              <option value="standard">Standard cleaning</option>
              <option value="deep">Deep cleaning</option>
              <option value="moving">Move-in / Move-out</option>
              <option value="windows">Window cleaning</option>
              <option value="office">Office / Commercial</option>
            </select>
          </Field>
          <div className="flex items-center justify-center p-3">
            <button
              type="submit"
              className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold transition-all hover:opacity-95 md:w-auto"
              style={{ background: C.ember, color: C.paper }}
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
            </button>
          </div>
        </div>
      </form>

      {/* Compliance strip */}
      <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.18em]" style={{ color: C.subtle }}>
        <span>Stripe Payments</span>
        <span>·</span>
        <span>SEPA · iDEAL · Bancontact · MobilePay</span>
        <span>·</span>
        <span>SCA / 3DS2</span>
        <span>·</span>
        <span>ISO 27001 aligned</span>
      </div>
    </section>
  );
}

function Field({
  icon,
  label,
  children,
  divider,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <label
      className="group relative flex flex-col justify-center px-5 py-4 transition-colors hover:bg-[--hover]"
      style={{
        ["--hover" as string]: C.bg,
        borderTop: divider ? `1px solid ${C.hairline}` : undefined,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-4 hidden h-[calc(100%-2rem)] w-px md:block"
        style={{ background: divider ? C.hairline : "transparent" }}
      />
      <span className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.subtle }}>
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Feature grid — three-column value props with mono numerals.
// ---------------------------------------------------------------------------
function Features() {
  const items = [
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      kicker: "01 · Trust",
      title: "Vetted across every market",
      body: "Providers pass KYC, background checks and reference reviews compliant with local law — from GDPR to national labour agreements.",
    },
    {
      icon: <Lock className="h-5 w-5" />,
      kicker: "02 · Payments",
      title: "Escrowed, PSD2-compliant",
      body: "Funds are captured on booking and released only after you approve the work. SEPA, cards and local rails — settled in your currency.",
    },
    {
      icon: <Zap className="h-5 w-5" />,
      kicker: "03 · Speed",
      title: "From search to booked in 90 seconds",
      body: "Real-time availability from every provider's calendar. No bidding wars, no back-and-forth, no hidden fees — ever.",
    },
  ];
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.paper }}>
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          kicker="The platform"
          title={<>One marketplace. <span className="italic" style={{ color: C.tealSoft }}>Every European home.</span></>}
          intro="Built as a technology platform first — with the compliance, payments infrastructure and provider tooling to operate at continental scale."
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border md:grid-cols-3" style={{ borderColor: C.line, background: C.line }}>
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative flex flex-col p-8 transition-colors md:p-10"
              style={{ background: C.paper }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] tabular-nums" style={{ color: C.tealSoft }}>
                {it.kicker}
              </div>
              <div
                className="mt-6 grid h-11 w-11 place-items-center rounded-xl transition-colors"
                style={{ background: C.cream, color: C.teal }}
              >
                {it.icon}
              </div>
              <h3 className="mt-6 font-serif text-[26px] leading-tight tracking-tight" style={{ color: C.ink }}>
                {it.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: C.muted }}>
                {it.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// European coverage strip — reinforces continental scale.
// ---------------------------------------------------------------------------
function Coverage() {
  return (
    <section className="relative px-5 py-16 sm:px-8" style={{ background: C.bg, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.subtle }}>
            Available across Europe
          </div>
          <div className="text-xs tabular-nums" style={{ color: C.muted }}>
            {TRUST.countries} countries · 84 cities · 6 currencies
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-8">
          {MARKETS.map((m) => (
            <div
              key={m.code}
              className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm transition-all hover:-translate-y-0.5 hover:shadow-sm"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <span className="text-base leading-none">{m.flag}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{m.city}</div>
                <div className="text-[10px] uppercase tracking-widest tabular-nums" style={{ color: C.subtle }}>
                  {m.currency}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Marketplace preview — European provider cards, local currencies.
// ---------------------------------------------------------------------------
function Marketplace() {
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.paper }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeader
            kicker="The marketplace"
            title={<>Meet the people behind <span className="italic" style={{ color: C.tealSoft }}>clean homes</span>.</>}
            intro="Every provider is independent, insured and rated by real customers in their own city."
          />
          <Link
            to="/find-cleaner"
            className="group inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5"
            style={{ borderColor: C.ink, color: C.ink }}
          >
            Browse all providers
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.id} p={p} />
          ))}
        </div>

        {/* Metric strip — Stripe-inspired precision numerals */}
        <div
          className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border md:grid-cols-4"
          style={{ borderColor: C.line, background: C.line }}
        >
          {[
            { k: TRUST.cleanerCount, v: "verified providers" },
            { k: TRUST.bookedThisWeek, v: "bookings this week" },
            { k: TRUST.rating + "★", v: "average rating" },
            { k: "100%", v: "money-back guarantee" },
          ].map((s) => (
            <div key={s.v} className="px-6 py-8" style={{ background: C.paper }}>
              <div className="font-serif text-4xl tabular-nums md:text-5xl" style={{ color: C.teal }}>
                {s.k}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: C.subtle }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProviderCard({ p }: { p: (typeof PROVIDERS)[number] }) {
  const currencySymbol =
    p.currency === "EUR" ? "€" : p.currency === "SEK" ? "kr" : p.currency === "DKK" ? "kr" : p.currency;
  return (
    <article
      className="group flex flex-col overflow-hidden rounded-3xl border bg-white transition-all hover:-translate-y-1 hover:shadow-[0_28px_60px_-24px_rgba(10,31,30,0.28)]"
      style={{ borderColor: C.line }}
    >
      {/* Portrait area */}
      <div
        className="relative aspect-[5/3] overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${C.cream}, ${C.mint})` }}
      >
        <div
          className="absolute inset-0 grid place-items-center font-serif text-6xl transition-transform duration-500 group-hover:scale-105"
          style={{ color: C.teal }}
        >
          {p.initials}
        </div>
        {p.verified && (
          <span
            className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm"
            style={{ background: C.paper, color: C.teal }}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Verified
          </span>
        )}
        <span
          className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums shadow-sm"
          style={{ background: C.paper, color: C.ink }}
        >
          <Star className="h-3.5 w-3.5" style={{ color: C.amber }} fill={C.amber} />
          {p.rating.toFixed(2)} <span style={{ color: C.subtle }}>({p.reviews})</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl leading-tight tracking-tight" style={{ color: C.ink }}>
              {p.name}
            </h3>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
              <span aria-hidden>{p.flag}</span>
              <MapPin className="h-3.5 w-3.5" />
              {p.city}, {p.country}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.subtle }}>
              From
            </div>
            <div className="font-serif text-xl tabular-nums" style={{ color: C.teal }}>
              {currencySymbol === "€" ? `€${p.priceFrom}` : `${p.priceFrom} ${currencySymbol}`}
              <span className="text-xs" style={{ color: C.subtle }}>/hr</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed" style={{ color: C.muted }}>
          {p.tagline}
        </p>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: C.muted }}>
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5" style={{ color: C.tealSoft }} />
            {p.languages.join(" · ")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" style={{ color: C.tealSoft }} />
            {p.experience}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" style={{ color: C.tealSoft }} />
            {p.responseTime}
          </span>
        </div>

        <Link
          to={`/find-cleaner`}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-all hover:opacity-95"
          style={{ background: C.ink, color: C.bg }}
        >
          Book {p.name.split(" ")[0]}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Section header — precise kicker + editorial title.
// ---------------------------------------------------------------------------
function SectionHeader({
  kicker,
  title,
  intro,
}: {
  kicker: string;
  title: React.ReactNode;
  intro?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: C.tealSoft }}>
        <span className="h-px w-8" style={{ background: C.tealSoft }} />
        {kicker}
      </div>
      <h2
        className="mt-4 font-serif leading-[1.02] tracking-[-0.015em]"
        style={{ color: C.ink, fontSize: "clamp(2rem, 4.6vw, 3.4rem)" }}
      >
        {title}
      </h2>
      {intro && (
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed" style={{ color: C.muted }}>
          {intro}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// For providers — a Stripe-style horizontal split block.
// ---------------------------------------------------------------------------
function ForProviders() {
  const points = [
    "Instant onboarding with Stripe Connect",
    "Local labour rate protection in every country",
    "Get paid in your local currency, weekly",
    "Own your calendar — no bidding, no undercutting",
  ];
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.bg }}>
      <div className="mx-auto grid max-w-6xl gap-10 rounded-[32px] border bg-white p-8 md:grid-cols-2 md:p-14" style={{ borderColor: C.line }}>
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: C.ember }}>
            <span className="h-px w-8" style={{ background: C.ember }} />
            For providers
          </div>
          <h2 className="mt-4 font-serif leading-[1.02] tracking-tight" style={{ color: C.ink, fontSize: "clamp(1.8rem, 4vw, 2.8rem)" }}>
            Run your cleaning business <span className="italic" style={{ color: C.tealSoft }}>like a European tech company.</span>
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed" style={{ color: C.muted }}>
            Own your schedule, your prices and your customer relationships. MyCleaner handles payments,
            invoicing, tax reporting and compliance in every market you serve.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/provider/register"
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{ background: C.ember, color: C.paper }}
            >
              Apply to join
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/regler"
              className="inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{ borderColor: C.line, color: C.ink }}
            >
              See how earnings work
            </Link>
          </div>
        </div>
        <ul className="grid gap-3 self-center">
          {points.map((p) => (
            <li
              key={p}
              className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-[15px]"
              style={{ borderColor: C.hairline, background: C.bg, color: C.ink }}
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: C.tealSoft }} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA — dark editorial finish.
// ---------------------------------------------------------------------------
function CTA() {
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.paper }}>
      <div
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] px-8 py-16 text-center md:px-16 md:py-24"
        style={{ background: C.ink, color: C.bg }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: `
              linear-gradient(to right, ${C.bg} 1px, transparent 1px),
              linear-gradient(to bottom, ${C.bg} 1px, transparent 1px)
            `,
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full blur-3xl"
          style={{ background: C.tealSoft, opacity: 0.35 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full blur-3xl"
          style={{ background: C.ember, opacity: 0.25 }}
        />
        <h2
          className="relative font-serif leading-[1.02] tracking-[-0.015em]"
          style={{ fontSize: "clamp(2rem, 5.2vw, 3.6rem)" }}
        >
          A cleaner home, anywhere in Europe.
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-base leading-relaxed opacity-75">
          One account. Every market. Book a trusted provider in under two minutes.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/find-cleaner"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ background: C.bg, color: C.ink }}
          >
            Book a cleaner
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/provider/register"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ borderColor: `${C.bg}44`, color: C.bg }}
          >
            Become a provider
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer — compact, multi-market.
// ---------------------------------------------------------------------------
function Footer() {
  return (
    <footer style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg font-serif text-base" style={{ background: C.teal, color: C.bg }}>
              M
            </span>
            <span className="font-serif text-lg" style={{ color: C.ink }}>MyCleaner</span>
          </div>
          <p className="mt-4 max-w-xs text-sm" style={{ color: C.muted }}>
            The European marketplace for home services. Live in {TRUST.countries} countries.
          </p>
        </div>
        {[
          { h: "Product", l: [["Find a cleaner", "/find-cleaner"], ["How it works", "/regler"], ["FAQ", "/faq"]] },
          { h: "Providers", l: [["Apply", "/provider/register"], ["Earnings", "/regler"], ["Enterprise", "/faq"]] },
          { h: "Company", l: [["Terms", "/regler"], ["Privacy", "/privacy"], ["Sign in", "/login"]] },
        ].map((col) => (
          <div key={col.h}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.subtle }}>
              {col.h}
            </div>
            <ul className="mt-4 space-y-2.5 text-sm" style={{ color: C.ink }}>
              {col.l.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="transition-colors hover:opacity-70">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t" style={{ borderColor: C.line }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs sm:px-8" style={{ color: C.subtle }}>
          <div>© {new Date().getFullYear()} MyCleaner ApS · CVR 43 12 87 55</div>
          <div className="flex items-center gap-3">
            <span>🇩🇰 🇸🇪 🇩🇪 🇳🇱 🇫🇷 🇪🇸 🇮🇹 🇵🇱 🇧🇪 🇦🇹 🇫🇮 🇳🇴</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Index() {
  return (
    <main className="min-h-screen font-body" style={{ background: C.bg, color: C.ink }}>
      <Nav />
      <Hero />
      <SearchPanel />
      <Features />
      <Coverage />
      <Marketplace />
      <ForProviders />
      <CTA />
      <Footer />
    </main>
  );
}
