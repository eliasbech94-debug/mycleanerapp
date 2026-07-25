import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Star,
  ShieldCheck,
  Calendar,
  CheckCircle2,
  MapPin,
  Search,
  Clock,
  CreditCard,
  Sparkles,
  Languages,
} from "lucide-react";

/**
 * MyCleaner — Landing page
 * Premium Scandinavian design. Sage & Cream palette.
 * Instrument Serif headings, Work Sans body. Hero + Card grid.
 * UI only — routes, auth and data flows unchanged.
 */

// Palette — Sage & Cream
const C = {
  cream: "#f5f0e8",
  paper: "#faf7f2",
  mist: "#dce5d4",
  sage: "#a8c0a0",
  moss: "#7d9b76",
  forest: "#2f4a2a",
  ink: "#1a201a",
  muted: "#5e6a5a",
  line: "#e5e0d6",
};

// Configurable trust metrics (placeholders until wired to production data)
const TRUST = {
  rating: "4.9",
  reviewCount: "1,240+",
  cleanerCount: "2,400+",
  bookedThisWeek: "3,100",
};

const PROVIDERS = [
  {
    id: "p_001",
    name: "Sofia Møller",
    initials: "SM",
    area: "København K",
    distance: "1.2 km",
    rating: 4.95,
    reviews: 142,
    verified: true,
    languages: ["Dansk", "English"],
    experience: "6 år",
    priceFrom: 280,
    responseTime: "~12 min",
    tagline: "Grundig, diskret og med sans for detaljen.",
  },
  {
    id: "p_002",
    name: "Anna Lindqvist",
    initials: "AL",
    area: "Frederiksberg",
    distance: "2.8 km",
    rating: 4.92,
    reviews: 96,
    verified: true,
    languages: ["Svenska", "Dansk", "English"],
    experience: "4 år",
    priceFrom: 265,
    responseTime: "~20 min",
    tagline: "Miljøvenlige produkter og fast rytme.",
  },
  {
    id: "p_003",
    name: "Mikkel Holm",
    initials: "MH",
    area: "Nørrebro",
    distance: "0.9 km",
    rating: 4.88,
    reviews: 210,
    verified: true,
    languages: ["Dansk", "English", "Deutsch"],
    experience: "8 år",
    priceFrom: 295,
    responseTime: "~8 min",
    tagline: "Hovedrengøring og flytterengøring, altid til tiden.",
  },
];

// ---------- Nav ----------
function Nav() {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{ background: `${C.cream}dd`, borderBottom: `1px solid ${C.line}` }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-full font-serif text-lg"
            style={{ background: C.forest, color: C.cream }}
          >
            M
          </span>
          <span className="font-serif text-xl tracking-tight" style={{ color: C.ink }}>
            MyCleaner
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm md:flex" style={{ color: C.muted }}>
          <Link to="/find-cleaner" className="transition-colors hover:text-[color:var(--ink)]" style={{ ["--ink" as string]: C.ink }}>
            Find cleaner
          </Link>
          <Link to="/regler" className="transition-colors hover:text-[color:var(--ink)]" style={{ ["--ink" as string]: C.ink }}>
            Sådan virker det
          </Link>
          <Link to="/provider/register" className="transition-colors hover:text-[color:var(--ink)]" style={{ ["--ink" as string]: C.ink }}>
            Bliv provider
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: C.ink }}
          >
            Log ind
          </Link>
          <Link
            to="/customer/register"
            className="hidden rounded-full px-4 py-2 text-sm font-medium transition-all hover:opacity-90 sm:inline-block"
            style={{ background: C.forest, color: C.cream }}
          >
            Kom i gang
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------- Hero ----------
function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.cream }}>
      {/* subtle sage blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: C.sage, opacity: 0.35 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ background: C.mist, opacity: 0.6 }}
      />

      <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-16 text-center sm:px-8 sm:pt-24 md:pb-24 md:pt-28">
        <div
          className="mx-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium animate-[fade-in_0.6s_ease-out]"
          style={{ borderColor: C.line, color: C.muted, background: `${C.paper}cc` }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.moss }} />
          Ny på MyCleaner — plads til 200 nye kunder i marts
        </div>

        <h1
          className="mx-auto mt-7 max-w-4xl font-serif leading-[0.98] tracking-tight animate-[fade-up_0.7s_ease-out]"
          style={{ color: C.ink, fontSize: "clamp(2.6rem, 7.4vw, 5.4rem)" }}
        >
          Hjemmet fortjener{" "}
          <span className="italic" style={{ color: C.moss }}>
            omtanke
          </span>
          .
          <br className="hidden sm:block" /> Book en cleaner på minutter.
        </h1>

        <p
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg animate-[fade-up_0.8s_ease-out]"
          style={{ color: C.muted }}
        >
          Verificerede, forsikrede cleanere i Danmark. Vælg en person du kan lide,
          book direkte i kalenderen, og betal først når arbejdet er godkendt.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-[fade-up_0.9s_ease-out]">
          <Link
            to="/find-cleaner"
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ background: C.forest, color: C.cream }}
          >
            Book en cleaner
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <Link
            to="/provider/register"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ borderColor: C.forest, color: C.forest, background: "transparent" }}
          >
            Bliv provider
          </Link>
        </div>

        {/* Trust row */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm" style={{ color: C.muted }}>
          <div className="inline-flex items-center gap-2">
            <div className="flex" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-4 w-4" style={{ color: C.moss }} fill={C.moss} />
              ))}
            </div>
            <span>
              <span className="font-semibold" style={{ color: C.ink }}>
                {TRUST.rating}
              </span>{" "}
              · Anbefalet af {TRUST.reviewCount} kunder
            </span>
          </div>
          <div className="hidden h-4 w-px sm:block" style={{ background: C.line }} />
          <div className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" style={{ color: C.moss }} />
            <span>Forsikret · KYC-verificeret</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Search ----------
function SearchPanel() {
  const [type, setType] = useState("standard");
  return (
    <section className="relative -mt-8 px-5 pb-16 sm:px-8 md:-mt-14" style={{ background: C.cream }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          window.location.assign("/find-cleaner");
        }}
        className="mx-auto grid max-w-5xl grid-cols-1 items-stretch overflow-hidden rounded-3xl border bg-white shadow-[0_20px_60px_-24px_rgba(31,45,29,0.25)] md:grid-cols-[1.4fr_1fr_0.9fr_1.1fr_auto]"
        style={{ borderColor: C.line }}
      >
        <Field icon={<MapPin className="h-4 w-4" />} label="Adresse">
          <input
            type="text"
            defaultValue="2200 København N"
            placeholder="Indtast adresse eller postnummer"
            className="w-full bg-transparent text-sm font-medium focus:outline-none"
            style={{ color: C.ink }}
          />
        </Field>
        <Field icon={<Calendar className="h-4 w-4" />} label="Dato" divider>
          <input
            type="date"
            className="w-full bg-transparent text-sm font-medium focus:outline-none"
            style={{ color: C.ink }}
          />
        </Field>
        <Field icon={<Clock className="h-4 w-4" />} label="Tidspunkt" divider>
          <select className="w-full bg-transparent text-sm font-medium focus:outline-none" style={{ color: C.ink }}>
            <option>Morgen (8–11)</option>
            <option>Middag (11–14)</option>
            <option>Eftermiddag (14–17)</option>
            <option>Aften (17–20)</option>
          </select>
        </Field>
        <Field icon={<Sparkles className="h-4 w-4" />} label="Type rengøring" divider>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-transparent text-sm font-medium focus:outline-none"
            style={{ color: C.ink }}
          >
            <option value="standard">Standard rengøring</option>
            <option value="deep">Hovedrengøring</option>
            <option value="moving">Flytterengøring</option>
            <option value="windows">Vinduespudsning</option>
            <option value="office">Erhverv</option>
          </select>
        </Field>
        <div className="flex items-center justify-center p-3">
          <button
            type="submit"
            className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold transition-all hover:opacity-95 md:w-auto"
            style={{ background: C.forest, color: C.cream }}
          >
            <Search className="h-4 w-4" />
            <span>Søg</span>
          </button>
        </div>
      </form>
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
      className="group relative flex flex-col justify-center px-5 py-4 transition-colors hover:bg-[color:var(--hover)]"
      style={{
        ["--hover" as string]: C.paper,
        borderTop: divider ? `1px solid ${C.line}` : undefined,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-4 hidden h-[calc(100%-2rem)] w-px md:block"
        style={{ background: divider ? C.line : "transparent" }}
      />
      <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------- Features ----------
function Features() {
  const items = [
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Verificerede providere",
      body: "Alle cleanere gennemgår KYC, straffeattest og reference­tjek. Kun de bedste kommer på platformen.",
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: "Sikker betaling",
      body: "Beløbet reserveres og udbetales først når du har godkendt arbejdet. Fuld dækning gennem MyCleaner.",
    },
    {
      icon: <Clock className="h-5 w-5" />,
      title: "Book på minutter",
      body: "Se ledige tider direkte i providerens kalender. Ingen budrunder, ingen ventetid, ingen forhandling.",
    },
  ];
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.paper }}>
      <div className="mx-auto max-w-6xl">
        <SectionHeader kicker="Hvorfor MyCleaner" title={<>Enkelt. Sikkert. Menneskeligt.</>} />
        <div className="mt-14 grid gap-4 md:grid-cols-3 md:gap-6">
          {items.map((it) => (
            <div
              key={it.title}
              className="group rounded-3xl border bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(31,45,29,0.25)]"
              style={{ borderColor: C.line }}
            >
              <div
                className="grid h-11 w-11 place-items-center rounded-full transition-colors"
                style={{ background: C.mist, color: C.forest }}
              >
                {it.icon}
              </div>
              <h3 className="mt-6 font-serif text-2xl tracking-tight" style={{ color: C.ink }}>
                {it.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: C.muted }}>
                {it.body}
              </p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.moss }}>
                <CheckCircle2 className="h-4 w-4" /> Standard for alle bookinger
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Marketplace preview ----------
function Marketplace() {
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.cream }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader
            kicker="Populære cleanere nær dig"
            title={
              <>
                Mød menneskene bag <span className="italic" style={{ color: C.moss }}>rene hjem</span>.
              </>
            }
          />
          <Link
            to="/find-cleaner"
            className="group inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5"
            style={{ borderColor: C.forest, color: C.forest }}
          >
            Se alle cleanere
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.id} p={p} />
          ))}
        </div>

        {/* Trust strip */}
        <div
          className="mt-16 grid grid-cols-2 gap-6 rounded-3xl border px-6 py-8 md:grid-cols-4"
          style={{ borderColor: C.line, background: C.paper }}
        >
          {[
            { k: TRUST.cleanerCount, v: "verificerede cleanere" },
            { k: TRUST.bookedThisWeek, v: "bookinger denne uge" },
            { k: TRUST.rating + "★", v: `gennemsnitlig rating` },
            { k: "100%", v: "penge tilbage garanti" },
          ].map((s) => (
            <div key={s.v} className="text-center md:text-left">
              <div className="font-serif text-3xl md:text-4xl" style={{ color: C.forest }}>
                {s.k}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider" style={{ color: C.muted }}>
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
  return (
    <article
      className="group flex flex-col overflow-hidden rounded-3xl border bg-white transition-all hover:-translate-y-1 hover:shadow-[0_24px_60px_-24px_rgba(31,45,29,0.28)]"
      style={{ borderColor: C.line }}
    >
      {/* avatar area */}
      <div
        className="relative aspect-[5/3] overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${C.mist}, ${C.sage})` }}
      >
        <div
          className="absolute inset-0 grid place-items-center font-serif text-6xl transition-transform duration-500 group-hover:scale-105"
          style={{ color: `${C.forest}` }}
        >
          {p.initials}
        </div>
        {p.verified && (
          <span
            className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm"
            style={{ background: C.paper, color: C.forest }}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Verificeret
          </span>
        )}
        <span
          className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm"
          style={{ background: C.paper, color: C.ink }}
        >
          <Star className="h-3.5 w-3.5" style={{ color: C.moss }} fill={C.moss} />
          {p.rating.toFixed(2)} <span style={{ color: C.muted }}>({p.reviews})</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl leading-tight tracking-tight" style={{ color: C.ink }}>
              {p.name}
            </h3>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
              <MapPin className="h-3.5 w-3.5" />
              {p.area} · {p.distance}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: C.muted }}>
              Fra
            </div>
            <div className="font-serif text-xl" style={{ color: C.forest }}>
              {p.priceFrom} kr<span className="text-xs" style={{ color: C.muted }}>/t</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed" style={{ color: C.muted }}>
          {p.tagline}
        </p>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: C.muted }}>
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5" style={{ color: C.moss }} />
            {p.languages.join(", ")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" style={{ color: C.moss }} />
            {p.experience} erfaring
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" style={{ color: C.moss }} />
            Svar {p.responseTime}
          </span>
        </div>

        <Link
          to={`/find-cleaner`}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-all hover:opacity-95"
          style={{ background: C.forest, color: C.cream }}
        >
          Book {p.name.split(" ")[0]}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

// ---------- Section header ----------
function SectionHeader({ kicker, title }: { kicker: string; title: React.ReactNode }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: C.moss }}>
        <span className="h-px w-8" style={{ background: C.moss }} />
        {kicker}
      </div>
      <h2
        className="mt-4 max-w-3xl font-serif leading-[1.02] tracking-tight"
        style={{ color: C.ink, fontSize: "clamp(2rem, 4.6vw, 3.4rem)" }}
      >
        {title}
      </h2>
    </div>
  );
}

// ---------- CTA ----------
function CTA() {
  return (
    <section className="relative px-5 py-20 sm:px-8 md:py-28" style={{ background: C.paper }}>
      <div
        className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] px-8 py-16 text-center md:px-16 md:py-24"
        style={{ background: C.forest, color: C.cream }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full blur-3xl"
          style={{ background: C.sage, opacity: 0.3 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full blur-3xl"
          style={{ background: C.moss, opacity: 0.4 }}
        />
        <h2
          className="relative font-serif leading-[1.02] tracking-tight"
          style={{ fontSize: "clamp(2rem, 5.2vw, 3.6rem)" }}
        >
          Klar til et renere hjem?
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-base leading-relaxed opacity-80">
          Find en cleaner du kan stole på — book i kalenderen på under 2 minutter.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/find-cleaner"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ background: C.cream, color: C.forest }}
          >
            Book en cleaner
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/provider/register"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{ borderColor: `${C.cream}55`, color: C.cream }}
          >
            Bliv provider
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------- Footer ----------
function Footer() {
  return (
    <footer style={{ background: C.cream, borderTop: `1px solid ${C.line}` }}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm sm:px-8" style={{ color: C.muted }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-full font-serif text-sm" style={{ background: C.forest, color: C.cream }}>
            M
          </span>
          <span className="font-serif text-lg" style={{ color: C.ink }}>MyCleaner</span>
          <span className="hidden opacity-60 md:inline">· København</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/regler" className="hover:underline">Vilkår</Link>
          <Link to="/privacy" className="hover:underline">Privatliv</Link>
          <Link to="/faq" className="hover:underline">FAQ</Link>
          <Link to="/provider/register" className="hover:underline">Bliv provider</Link>
        </div>
        <div className="text-xs opacity-70">© {new Date().getFullYear()} MyCleaner ApS</div>
      </div>
    </footer>
  );
}

// ---------- Page ----------
export default function Index() {
  return (
    <main className="min-h-screen font-body" style={{ background: C.cream, color: C.ink }}>
      <Nav />
      <Hero />
      <SearchPanel />
      <Features />
      <Marketplace />
      <CTA />
      <Footer />
    </main>
  );
}
