import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowUpRight,
  Star,
  Shield,
  Calendar,
  Users,
  Repeat,
  Wind,
  CheckCircle2,
  Quote,
  MapPin,
  Heart,
  Search,
} from "lucide-react";

/**
 * MyCleaner — Provider-first booking platform
 * Kernebudskab: Find din cleaner → book direkte i hendes kalender.
 * IKKE: post en opgave og vent på bud.
 */

const C = {
  ink: "#0a3d3a",
  orange: "#ff6b35",
  cream: "#f5f0e0",
  teal: "#168a7a",
  mint: "#c8e6c0",
  paper: "#fbf6e7",
};

const PLATFORM_FEE = 0.28;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

// ---------- helpers ----------
function BubbleField({ tone = "cream" }: { tone?: "cream" | "ink" }) {
  const dotColor = tone === "ink" ? `${C.cream}10` : `${C.ink}10`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, ${dotColor} 1.5px, transparent 0)`,
        backgroundSize: "22px 22px",
      }}
    />
  );
}

function Stamp({ children, rotate = -6, color = C.orange }: { children: React.ReactNode; rotate?: number; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
      style={{ borderColor: color, color, transform: `rotate(${rotate}deg)`, background: "transparent" }}
    >
      {children}
    </span>
  );
}

// ---------- TopBar ----------
function TopBar() {
  return (
    <div className="relative z-10" style={{ background: C.ink, color: C.cream }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] sm:px-6 lg:px-10">
        <span className="opacity-80">Est. 2026 · København</span>
        <span className="hidden items-center gap-2 md:inline-flex">
          <span className="relative inline-block h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full" style={{ background: C.mint, opacity: 0.7 }} />
            <span className="absolute inset-0 rounded-full" style={{ background: C.mint }} />
          </span>
          14 cleanere booker i dag
        </span>
        <span className="opacity-80">🇩🇰 DK · DKK</span>
      </div>
    </div>
  );
}

// ---------- HERO ----------
function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.ink }}>
      <BubbleField tone="ink" />
      <div aria-hidden className="absolute -left-32 top-40 h-80 w-80 rounded-full blur-3xl" style={{ background: C.teal, opacity: 0.45 }} />
      <div aria-hidden className="absolute -right-24 -top-10 h-72 w-72 rounded-full blur-3xl" style={{ background: C.orange, opacity: 0.35 }} />

      <div
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 lg:block"
        style={{ writingMode: "vertical-rl", color: `${C.cream}55`, transform: "translateY(-50%) rotate(180deg)" }}
      >
        <span className="font-display text-sm tracking-[0.4em] uppercase">№ 01 — Match · Book · Mød igen</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-12 lg:px-10 lg:pb-28 lg:pt-16">
        {/* brand */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl shadow-lg" style={{ background: C.orange, color: C.ink }}>
              <span className="font-display text-2xl leading-none">M</span>
            </div>
            <div className="leading-tight">
              <div className="font-display text-xl" style={{ color: C.cream }}>
                MyCleaner<sup className="text-[10px] opacity-70">™</sup>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: `${C.cream}99` }}>
                A HomeHero Co.
              </div>
            </div>
          </div>
          <Link
            to="/login"
            className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition hover:bg-white/10"
            style={{ borderColor: `${C.cream}55`, color: C.cream }}
          >
            Log ind
          </Link>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-10">
          {/* Headline */}
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-3">
              <Stamp rotate={-4}>★ Provider-first booking</Stamp>
              <Stamp rotate={3} color={C.mint}>
                <Sparkles className="h-3 w-3" /> Ingen bud · Ingen ventetid
              </Stamp>
            </div>

            <h1
              className="mt-6 font-display leading-[0.92] tracking-tight"
              style={{ color: C.cream, fontSize: "clamp(2.6rem, 7vw, 5.4rem)" }}
            >
              Find{" "}
              <span className="relative inline-block">
                <span style={{ color: C.orange }}>din</span>
                <svg aria-hidden className="absolute -bottom-2 left-0 w-full" height="14" viewBox="0 0 200 14" preserveAspectRatio="none">
                  <path d="M2 8 Q 50 2, 100 7 T 198 6" fill="none" stroke={C.orange} strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>{" "}
              cleaner.
              <br />
              Book{" "}
              <span className="italic" style={{ color: C.mint }}>
                direkte
              </span>{" "}
              i kalenderen.
            </h1>

            <p className="mt-6 max-w-xl font-editorial text-base sm:text-lg" style={{ color: `${C.cream}cc` }}>
              MyCleaner er ikke en opgaveplatform. Du <strong style={{ color: C.cream }}>vælger</strong> selv
              din cleaner — kigger profilen igennem, ser ledige tider og booker
              det tidspunkt der passer dig. Samme person hver gang. Et rigtigt match.
            </p>

            {/* Search bar — provider-first */}
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-8 flex flex-wrap items-center gap-2 rounded-full p-2 shadow-[6px_6px_0_rgba(0,0,0,0.25)]"
              style={{ background: C.cream }}
            >
              <div className="flex flex-1 items-center gap-2 px-3">
                <MapPin className="h-4 w-4" style={{ color: C.ink }} />
                <input
                  type="text"
                  placeholder="Postnummer eller by"
                  className="w-full bg-transparent py-2 text-sm placeholder:opacity-50 focus:outline-none"
                  style={{ color: C.ink }}
                  defaultValue="2200 København N"
                />
              </div>
              <div className="hidden h-6 w-px md:block" style={{ background: `${C.ink}25` }} />
              <div className="hidden flex-1 items-center gap-2 px-3 md:flex">
                <Calendar className="h-4 w-4" style={{ color: C.ink }} />
                <select className="w-full bg-transparent py-2 text-sm focus:outline-none" style={{ color: C.ink }}>
                  <option>I denne uge</option>
                  <option>I næste uge</option>
                  <option>Fast aftale</option>
                </select>
              </div>
              <Link
                to="/task/create"
                className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold uppercase tracking-wider transition hover:-translate-y-0.5"
                style={{ background: C.ink, color: C.cream }}
              >
                <Search className="h-4 w-4" /> Find cleaner
              </Link>
            </form>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs" style={{ color: `${C.cream}aa` }}>
              <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: C.mint }} /> Forsikret & KYC
              </span>
              <span className="inline-flex items-center gap-2">
                <Star className="h-4 w-4" style={{ color: C.orange }} /> 4.9 · 2.140 jobs
              </span>
              <span className="inline-flex items-center gap-2">
                <Repeat className="h-4 w-4" style={{ color: C.mint }} /> Samme cleaner hver gang
              </span>
            </div>
          </motion.div>

          {/* Provider preview card with calendar */}
          <motion.div initial="hidden" animate="show" variants={fadeUp} custom={2} className="lg:col-span-5">
            <ProviderPreviewCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ---------- Provider preview card (hero) ----------
function ProviderPreviewCard() {
  const slots = ["08:00", "10:00", "13:00", "15:30"];
  const [selected, setSelected] = useState("10:00");
  const days = ["Man", "Tir", "Ons", "Tor", "Fre"];
  const dates = [10, 11, 12, 13, 14];
  const [selectedDay, setSelectedDay] = useState(1);

  return (
    <div className="relative" style={{ transform: "rotate(1.2deg)" }}>
      <div
        className="absolute -left-4 -top-4 z-10 grid h-20 w-20 place-items-center rounded-full text-center font-display text-xs leading-tight shadow-xl"
        style={{ background: C.mint, color: C.ink, transform: "rotate(-12deg)" }}
      >
        Ledig<br />i dag
      </div>

      <div className="relative rounded-[28px] p-6 shadow-[12px_12px_0_rgba(0,0,0,0.18)]" style={{ background: C.paper, color: C.ink }}>
        {/* Provider header */}
        <div className="flex items-start gap-4 border-b-2 border-dashed pb-4" style={{ borderColor: `${C.ink}25` }}>
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl font-display text-2xl"
            style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.ink})`, color: C.cream }}
          >
            SM
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="font-display text-xl">Sofia M.</div>
              <button aria-label="Favorit" className="grid h-8 w-8 place-items-center rounded-full" style={{ background: `${C.ink}10` }}>
                <Heart className="h-4 w-4" style={{ color: C.orange }} />
              </button>
            </div>
            <div className="text-xs opacity-70">København K · 1.2 km væk</div>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 font-bold">
                <Star className="h-3 w-3" style={{ color: C.orange }} fill={C.orange} /> 4.95
              </span>
              <span className="opacity-60">· 142 jobs</span>
              <span className="font-display text-sm" style={{ color: C.orange }}>280 kr/t</span>
            </div>
          </div>
        </div>

        {/* Calendar mini */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
              <Calendar className="h-4 w-4" /> Book i Sofias kalender
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Marts 2026</span>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            {days.map((d, i) => (
              <button
                key={d}
                onClick={() => setSelectedDay(i)}
                className="rounded-xl border-2 py-2 text-center transition"
                style={{
                  borderColor: selectedDay === i ? C.ink : `${C.ink}20`,
                  background: selectedDay === i ? C.ink : "transparent",
                  color: selectedDay === i ? C.cream : C.ink,
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{d}</div>
                <div className="font-display text-lg leading-none">{dates[i]}</div>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">Ledige tider</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelected(s)}
                  className="rounded-full border-2 py-2 text-xs font-bold transition"
                  style={{
                    borderColor: selected === s ? C.orange : `${C.ink}20`,
                    background: selected === s ? C.orange : "transparent",
                    color: selected === s ? C.ink : C.ink,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Link
          to={`/book/p_002?slot=${encodeURIComponent(selected)}`}
          className="mt-5 flex items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-bold uppercase tracking-wider transition hover:-translate-y-0.5"
          style={{ background: C.ink, color: C.cream }}
        >
          <span>Book Sofia · tor 13. kl {selected}</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        <p className="mt-3 text-[11px] opacity-70">
          Du betaler først når Sofia bekræfter. Ingen binding.
        </p>
      </div>
    </div>
  );
}

// ---------- Ribbon ----------
function Ribbon() {
  const items = ["Fast cleaner", "Ugentlig", "14-dages", "Engangs", "Flytte­rengøring", "Vinduespudsning", "Hovedrengøring", "Erhverv"];
  return (
    <div className="relative overflow-hidden border-y-2 py-5" style={{ background: C.orange, borderColor: C.ink }}>
      <div className="flex animate-[mc-marquee_28s_linear_infinite] gap-10 whitespace-nowrap">
        {[...items, ...items, ...items].map((it, i) => (
          <span key={i} className="font-display text-3xl sm:text-4xl" style={{ color: C.ink }}>
            {it} <span className="opacity-50">✦</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes mc-marquee { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }`}</style>
    </div>
  );
}

// ---------- Section header ----------
function SectionHeader({
  kicker,
  title,
  tone = "light",
  align = "left",
}: {
  kicker: string;
  title: React.ReactNode;
  tone?: "light" | "dark";
  align?: "left" | "center";
}) {
  const ink = tone === "dark" ? C.cream : C.ink;
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: C.orange }}>
        <span className="h-px w-8" style={{ background: C.orange }} />
        {kicker}
      </div>
      <h2 className="mt-3 font-display leading-[0.95]" style={{ color: ink, fontSize: "clamp(2rem, 5vw, 3.6rem)" }}>
        {title}
      </h2>
    </div>
  );
}

// ---------- Process — reframed for provider-first ----------
function Process() {
  const steps = [
    { n: "01", title: "Browse cleanere", body: "Filtrér på område, pris, tid og services. Se profiler, anmeldelser og videoer.", icon: <Search className="h-5 w-5" /> },
    { n: "02", title: "Vælg dit match", body: "Læs anmeldelser, se hvem der er kemi med dig. Du bestemmer — ikke en algoritme.", icon: <Heart className="h-5 w-5" /> },
    { n: "03", title: "Book i kalenderen", body: "Vælg en ledig tid hos din cleaner og hvilken service. Bekræft. Færdig.", icon: <Calendar className="h-5 w-5" /> },
    { n: "04", title: "Mød hende igen", body: "Synes du om Sofia? Gør hende til din faste cleaner med ét tryk.", icon: <Repeat className="h-5 w-5" /> },
  ];
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.cream }}>
      <BubbleField />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeader
          kicker="№ 02 — Sådan virker MyCleaner"
          title={
            <>
              Du booker <span className="italic" style={{ color: C.orange }}>personen</span>.<br />
              Ikke en opgave.
            </>
          }
        />
        <p className="mt-4 max-w-2xl font-editorial text-base opacity-70" style={{ color: C.ink }}>
          Glem opslagstavlen hvor du smider en opgave op og venter på bud. Hos
          MyCleaner vælger du selv hvem der kommer i dit hjem — og hun ved at
          du har valgt netop hende.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={i}
              className="relative rounded-3xl border-2 bg-white p-6 shadow-[6px_6px_0_rgba(10,61,58,0.12)]"
              style={{ borderColor: C.ink }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-5xl" style={{ color: C.orange }}>{s.n}</span>
                <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: C.ink, color: C.cream }}>
                  {s.icon}
                </span>
              </div>
              <h3 className="mt-6 font-display text-xl" style={{ color: C.ink }}>{s.title}</h3>
              <p className="mt-2 text-sm opacity-70" style={{ color: C.ink }}>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Cleaners directory ----------
function Cleaners() {
  const cleaners = [
    { id: "p_002", name: "Sofia M.", area: "København K", rating: 4.95, jobs: 142, rate: 280, color: "#ff6b35", tag: "Top pick", next: "I dag · 10:00" },
    { id: "p_003", name: "Anders L.", area: "Aarhus C", rating: 4.92, jobs: 98, rate: 260, color: "#168a7a", tag: "Pålidelig", next: "I morgen · 08:00" },
    { id: "p_004", name: "Maja H.", area: "Frederiksberg", rating: 4.98, jobs: 211, rate: 320, color: "#0a3d3a", tag: "Eco-pro", next: "Fre · 13:00" },
    { id: "p_001", name: "Pawel K.", area: "Odense", rating: 4.89, jobs: 67, rate: 240, color: "#c9a84c", tag: "Hurtig", next: "I dag · 15:30" },
  ];
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.ink }}>
      <BubbleField tone="ink" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeader
            kicker="№ 03 — Cleanere nær dig"
            tone="dark"
            title={
              <>
                Browse profiler.{" "}
                <span className="italic" style={{ color: C.mint }}>Find dit match.</span>
              </>
            }
          />
          <Link to="/task/create" className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider" style={{ color: C.orange }}>
            Se alle cleanere <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cleaners.map((c, i) => (
            <motion.div
              key={c.name}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              custom={i}
            >
              <Link
                to={`/book/${c.id}`}
                className="group relative block overflow-hidden rounded-3xl border transition hover:-translate-y-1"
                style={{ borderColor: `${C.cream}20`, background: `${C.cream}08` }}
              >
                <div
                  className="relative flex aspect-[4/5] items-end p-5"
                  style={{ background: `linear-gradient(160deg, ${c.color} 0%, ${C.ink} 130%)` }}
                >
                  <span className="font-display" style={{ color: C.cream, fontSize: "clamp(3.5rem, 8vw, 5.5rem)", lineHeight: 0.9 }}>
                    {c.name.split(" ")[0][0]}
                    {c.name.split(" ")[1][0]}
                  </span>
                  <span className="absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider shadow" style={{ background: C.cream, color: C.ink }}>
                    ★ {c.rating}
                  </span>
                  <span className="absolute left-3 top-3 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em]" style={{ borderColor: C.cream, color: C.cream, background: "rgba(0,0,0,0.25)" }}>
                    {c.tag}
                  </span>
                </div>
                <div className="p-4" style={{ color: C.cream }}>
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-xl">{c.name}</div>
                    <div className="font-display text-base" style={{ color: C.orange }}>{c.rate} kr/t</div>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs opacity-70">
                    <span>{c.area}</span>
                    <span>{c.jobs} jobs</span>
                  </div>
                  <div
                    className="mt-3 flex items-center justify-between rounded-xl border px-3 py-2 text-[11px] transition group-hover:border-mint"
                    style={{ borderColor: `${C.mint}40`, background: `${C.mint}10` }}
                  >
                    <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: C.mint }}>
                      <Calendar className="h-3 w-3" /> Book nu
                    </span>
                    <span className="font-bold" style={{ color: C.cream }}>{c.next}</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Why provider-first ----------
function WhyMatch() {
  const items = [
    {
      title: "Du vælger personen",
      body: "Ikke en tilfældig der vinder en budrunde. Du ser ansigtet, læser anmeldelser, mærker om det matcher.",
    },
    {
      title: "Samme cleaner hver gang",
      body: "Når kemien passer, gør du hende til din faste. Hun lærer dit hjem at kende — og du behøver ikke forklare alt forfra.",
    },
    {
      title: "Reel kalender · reel tid",
      body: "Du booker en ledig tid direkte. Ingen frem og tilbage på chat. Ingen ventetid på bud.",
    },
  ];
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.paper }}>
      <BubbleField />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeader
              kicker="№ 04 — Hvorfor MyCleaner"
              title={
                <>
                  Et hjem er <span className="italic" style={{ color: C.orange }}>personligt</span>. Det skal din cleaner også være.
                </>
              }
            />
            <p className="mt-5 font-editorial text-base opacity-70" style={{ color: C.ink }}>
              Andre platforme behandler rengøring som en opgave der skal opløses. Vi behandler det som en relation der skal opbygges.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="space-y-4">
              {items.map((it, i) => (
                <motion.div
                  key={it.title}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className="flex items-start gap-5 rounded-3xl border-2 bg-white p-5 shadow-[6px_6px_0_rgba(10,61,58,0.10)]"
                  style={{ borderColor: C.ink }}
                >
                  <span className="font-display text-4xl" style={{ color: C.orange }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-xl" style={{ color: C.ink }}>{it.title}</h3>
                    <p className="mt-1 text-sm opacity-70" style={{ color: C.ink }}>{it.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Price calculator ----------
function PriceBreakdown() {
  const [sqm, setSqm] = useState(70);
  const [rate, setRate] = useState(280);
  const [hours, setHours] = useState(2);
  const suggestedHours = useMemo(() => Math.max(1.5, Math.round((sqm / 35) * 2) / 2), [sqm]);
  const base = rate * (hours || suggestedHours);
  const customerPays = Math.round(base * (1 + PLATFORM_FEE / 2));
  const providerGets = Math.round(base * (1 - PLATFORM_FEE / 2));

  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.cream }}>
      <BubbleField />
      <div className="relative mx-auto max-w-5xl">
        <SectionHeader
          kicker="№ 05 — Ærlig prissætning"
          align="center"
          title={
            <>
              Prisen sætter <span className="italic" style={{ color: C.orange }}>cleaneren</span>.<br />
              Gebyret deler vi.
            </>
          }
        />
        <p className="mx-auto mt-4 max-w-2xl text-center font-editorial opacity-70" style={{ color: C.ink }}>
          Hver cleaner har sin egen timepris. MyCleaner tager 28% i platformsgebyr — men i stedet for at en part bærer det hele, lægger vi 14% oveni til dig og trækker 14% fra cleaneren.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border-2 bg-white p-6 shadow-[6px_6px_0_rgba(10,61,58,0.12)]" style={{ borderColor: C.ink }}>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60" style={{ color: C.ink }}>Eksempel</div>
            <div className="mt-5 space-y-5">
              <Range label="Boligstørrelse" value={sqm} setValue={setSqm} min={20} max={250} step={5} suffix="m²" />
              <Range label="Cleanerens timepris" value={rate} setValue={setRate} min={180} max={500} step={10} suffix=" kr/t" />
              <Range label={`Antal timer · forslag ${suggestedHours}t`} value={hours} setValue={setHours} min={1} max={8} step={0.5} suffix="t" />
            </div>
          </div>

          <div className="rounded-3xl p-6 shadow-[6px_6px_0_rgba(0,0,0,0.18)]" style={{ background: C.ink, color: C.cream }}>
            <div className="flex items-end justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Du betaler</span>
              <span className="font-display text-[3rem] leading-none">
                {customerPays.toLocaleString("da-DK")}
                <span className="align-top text-base opacity-70"> kr</span>
              </span>
            </div>
            <div className="mt-6 space-y-3 border-t pt-4 text-sm" style={{ borderColor: `${C.cream}22` }}>
              <Row label="Cleanerens timepris" value={`${rate} kr/t × ${hours}t = ${rate * hours} kr`} />
              <Row label="+ 14% til platformen" value={`+${customerPays - rate * hours} kr`} accent={C.orange} />
              <Row label="= Du betaler" value={`${customerPays} kr`} bold />
              <div className="my-3 h-px" style={{ background: `${C.cream}22` }} />
              <Row label="Cleaneren får" value={`${providerGets} kr`} accent={C.mint} bold />
              <Row label="(efter 14% gebyr)" value="" muted />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, bold, muted, accent }: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`${muted ? "opacity-50" : "opacity-80"} ${bold ? "font-bold" : ""}`}>{label}</span>
      <span className={`font-display ${bold ? "text-lg" : "text-base"}`} style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

function Range({ label, value, setValue, min, max, step, suffix }: { label: string; value: number; setValue: (n: number) => void; min: number; max: number; step: number; suffix: string }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{label}</span>
        <span className="font-display text-xl">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-2 w-full cursor-pointer accent-[color:var(--mc-orange)]"
        style={{ ["--mc-orange" as any]: C.orange }}
      />
    </label>
  );
}

// ---------- Testimonial ----------
function Testimonial() {
  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.mint }}>
      <Quote aria-hidden className="absolute -left-6 -top-6 h-44 w-44 opacity-15" style={{ color: C.ink }} strokeWidth={1} />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: C.ink }}>
          <span className="h-px w-8" style={{ background: C.ink }} /> Stemmer fra hjemmene
        </div>
        <p className="mt-6 font-display italic leading-[1.1]" style={{ color: C.ink, fontSize: "clamp(1.6rem, 4vw, 2.6rem)" }}>
          "Sofia har været hos os hver anden uge i et halvt år nu. Hun ved
          hvor tingene står. Det er ikke en service længere — det er en del af
          vores hjem."
        </p>
        <div className="mt-8 inline-flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full font-display text-sm" style={{ background: C.ink, color: C.cream }}>LJ</div>
          <div className="text-left">
            <div className="font-bold" style={{ color: C.ink }}>Line Jakobsen</div>
            <div className="text-xs uppercase tracking-wider opacity-70" style={{ color: C.ink }}>Fast hos Sofia M. · Nørrebro</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Final CTA ----------
function FinalCTA() {
  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-10" style={{ background: C.orange }}>
      <BubbleField />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 left-0 right-0 select-none whitespace-nowrap font-display leading-none opacity-15"
        style={{ color: C.ink, fontSize: "clamp(120px, 22vw, 360px)" }}
      >
        MYCLEANER
      </div>
      <div className="relative mx-auto max-w-5xl text-center">
        <Stamp rotate={-3} color={C.ink}>★ Dit match venter</Stamp>
        <h2 className="mt-5 font-display leading-[0.95]" style={{ color: C.ink, fontSize: "clamp(2.4rem, 7vw, 5rem)" }}>
          Find din cleaner.<br />
          <span className="italic">Book i dag.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-editorial text-base sm:text-lg" style={{ color: `${C.ink}cc` }}>
          14 cleanere har ledige tider i din by lige nu. Vælg den der passer
          dig — og book direkte i hendes kalender.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/task/create"
            className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold uppercase tracking-wider shadow-[6px_6px_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5"
            style={{ background: C.ink, color: C.cream }}
          >
            <Search className="h-4 w-4" /> Find min cleaner
          </Link>
          <Link
            to="/provider/register"
            className="inline-flex items-center gap-2 rounded-full border-2 px-8 py-4 text-sm font-bold uppercase tracking-wider transition hover:bg-black/5"
            style={{ borderColor: C.ink, color: C.ink }}
          >
            Bliv cleaner
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-semibold" style={{ color: `${C.ink}aa` }}>
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Ingen binding</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Betal først ved bekræftelse</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Tilfredshedsgaranti</span>
        </div>
      </div>
    </section>
  );
}

export default function Index() {
  return (
    <main className="min-h-screen font-editorial" style={{ background: C.cream }}>
      <TopBar />
      <Hero />
      <Ribbon />
      <Process />
      <Cleaners />
      <WhyMatch />
      <PriceBreakdown />
      <Testimonial />
      <FinalCTA />
      <footer className="px-4 py-10 text-center text-xs sm:px-6" style={{ background: C.ink, color: `${C.cream}99` }}>
        © {new Date().getFullYear()} MyCleaner™ · Et HomeHero-brand · Du booker personen, ikke opgaven.
      </footer>
    </main>
  );
}
