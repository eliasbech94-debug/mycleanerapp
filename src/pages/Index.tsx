import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowUpRight,
  Star,
  Shield,
  Calculator,
  Users,
  Repeat,
  Wind,
  CheckCircle2,
  Quote,
} from "lucide-react";

/**
 * MyCleaner — Forside m. stærk brandidentitet
 * Palette: deep teal #0a3d3a, orange #ff6b35, cream #f5f0e0, teal #168a7a, mint #c8e6c0
 * Aesthetic: sticker / retro service-brand / boble-felt / stempler & bånd
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

// ---------- Re-usable: Bubble field ----------
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

// ---------- Brand stamp ----------
function Stamp({ children, rotate = -6, color = C.orange }: { children: React.ReactNode; rotate?: number; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
      style={{
        borderColor: color,
        color,
        transform: `rotate(${rotate}deg)`,
        background: "transparent",
      }}
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
          14 cleanere ledige i dag
        </span>
        <span className="opacity-80">🇩🇰 DK · DKK</span>
      </div>
    </div>
  );
}

// ---------- HERO ----------
function Hero() {
  const [sqm, setSqm] = useState(70);
  const [rate, setRate] = useState(280);
  const [hours, setHours] = useState(2);

  const suggestedHours = useMemo(() => Math.max(1.5, Math.round((sqm / 35) * 2) / 2), [sqm]);
  const base = rate * (hours || suggestedHours);
  const customerPays = Math.round(base * (1 + PLATFORM_FEE / 2));
  const providerGets = Math.round(base * (1 - PLATFORM_FEE / 2));

  return (
    <section className="relative overflow-hidden" style={{ background: C.ink }}>
      <BubbleField tone="ink" />

      {/* mint blob */}
      <div aria-hidden className="absolute -left-32 top-40 h-80 w-80 rounded-full blur-3xl" style={{ background: C.teal, opacity: 0.45 }} />
      <div aria-hidden className="absolute -right-24 -top-10 h-72 w-72 rounded-full blur-3xl" style={{ background: C.orange, opacity: 0.35 }} />

      {/* Side rail */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 lg:block"
        style={{ writingMode: "vertical-rl", color: `${C.cream}55`, transform: "translateY(-50%) rotate(180deg)" }}
      >
        <span className="font-display text-sm tracking-[0.4em] uppercase">№ 01 — Rent · Reelt · Rigtige hænder</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-12 lg:px-10 lg:pb-28 lg:pt-16">
        {/* Wordmark badge */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="grid h-12 w-12 place-items-center rounded-2xl shadow-lg"
              style={{ background: C.orange, color: C.ink }}
            >
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
              <Stamp rotate={-4}>★ Bedst i test 2026</Stamp>
              <Stamp rotate={3} color={C.mint}>
                <Sparkles className="h-3 w-3" /> 100% Tilfredshed
              </Stamp>
            </div>

            <h1
              className="mt-6 font-display leading-[0.92] tracking-tight"
              style={{ color: C.cream, fontSize: "clamp(2.8rem, 7.5vw, 5.6rem)" }}
            >
              Hjemmet skinner.{" "}
              <span className="relative inline-block">
                <span style={{ color: C.orange }}>Cleaneren</span>
                <svg
                  aria-hidden
                  className="absolute -bottom-2 left-0 w-full"
                  height="14"
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 8 Q 50 2, 100 7 T 198 6"
                    fill="none"
                    stroke={C.orange}
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              også.
              <br />
              <span className="italic" style={{ color: C.mint }}>
                28% deles. 100% fair.
              </span>
            </h1>

            <p className="mt-6 max-w-xl font-editorial text-base sm:text-lg" style={{ color: `${C.cream}cc` }}>
              MyCleaner er C2C-platformen hvor du booker direkte med
              verificerede rengøringsfolk. Du sætter timer, de sætter prisen —
              vi tager kun 14% fra hver side. Punktum.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/task/create"
                className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold uppercase tracking-wider shadow-[6px_6px_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0_rgba(0,0,0,0.25)]"
                style={{ background: C.orange, color: C.ink }}
              >
                Book rengøring
                <ArrowUpRight className="h-4 w-4 transition group-hover:rotate-45" />
              </Link>
              <Link
                to="/provider/register"
                className="inline-flex items-center gap-2 rounded-full border-2 px-7 py-3.5 text-sm font-bold uppercase tracking-wider transition hover:bg-white/10"
                style={{ borderColor: C.cream, color: C.cream }}
              >
                Bliv cleaner
              </Link>
            </div>

            {/* trust row */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs" style={{ color: `${C.cream}aa` }}>
              <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: C.mint }} /> Forsikret & KYC
              </span>
              <span className="inline-flex items-center gap-2">
                <Star className="h-4 w-4" style={{ color: C.orange }} /> 4.9 · 2.140 jobs
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" style={{ color: C.mint }} /> Klar inden 24t
              </span>
            </div>
          </motion.div>

          {/* Ticket-stub calculator */}
          <motion.div initial="hidden" animate="show" variants={fadeUp} custom={2} className="lg:col-span-5">
            <div className="relative" style={{ transform: "rotate(1.2deg)" }}>
              {/* Sticker tag */}
              <div
                className="absolute -left-4 -top-4 z-10 grid h-20 w-20 place-items-center rounded-full text-center font-display text-xs leading-tight shadow-xl"
                style={{ background: C.mint, color: C.ink, transform: "rotate(-12deg)" }}
              >
                Live<br />pris
              </div>

              <div
                className="relative rounded-[28px] p-7 shadow-[12px_12px_0_rgba(0,0,0,0.18)]"
                style={{ background: C.paper, color: C.ink }}
              >
                {/* Perforated edge */}
                <div className="mb-5 flex items-center justify-between border-b-2 border-dashed pb-4" style={{ borderColor: `${C.ink}30` }}>
                  <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em]">
                    <Calculator className="h-4 w-4" /> Beregner
                  </div>
                  <span className="font-display text-xs tracking-wider opacity-60">№ {String(sqm).padStart(3, "0")}</span>
                </div>

                <div className="space-y-5">
                  <Range label="Boligstørrelse" value={sqm} setValue={setSqm} min={20} max={250} step={5} suffix="m²" />
                  <Range label="Cleanerens timepris" value={rate} setValue={setRate} min={180} max={500} step={10} suffix=" kr/t" />
                  <Range
                    label={`Antal timer · forslag: ${suggestedHours}t`}
                    value={hours}
                    setValue={setHours}
                    min={1}
                    max={8}
                    step={0.5}
                    suffix="t"
                  />
                </div>

                <div className="mt-6 rounded-2xl p-5" style={{ background: C.ink, color: C.cream }}>
                  <div className="flex items-end justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Du betaler</span>
                    <span className="font-display text-[2.6rem] leading-none">
                      {customerPays.toLocaleString("da-DK")}
                      <span className="text-base align-top opacity-70"> kr</span>
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-[11px]" style={{ borderColor: `${C.cream}22` }}>
                    <div>
                      <div className="opacity-60 uppercase tracking-wider">Cleaner får</div>
                      <div className="font-display text-lg">{providerGets.toLocaleString("da-DK")} kr</div>
                    </div>
                    <div>
                      <div className="opacity-60 uppercase tracking-wider">Gebyr</div>
                      <div className="font-display text-lg">14% + 14%</div>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-[11px] leading-relaxed opacity-70">
                  Vi lægger 14% oveni til dig og trækker 14% fra cleaneren — så
                  bærer vi byrden sammen. Ingen skjulte gebyrer.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Range({
  label,
  value,
  setValue,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{label}</span>
        <span className="font-display text-xl">
          {value}
          {suffix}
        </span>
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

// ---------- Marquee strip (ribbon-style) ----------
function Ribbon() {
  const items = [
    "Ugentlig", "14-dages", "Månedlig", "Engangs",
    "Flytte­rengøring", "Vinduespudsning", "Hovedrengøring", "Erhverv",
  ];
  return (
    <div className="relative overflow-hidden border-y-2 py-5" style={{ background: C.orange, borderColor: C.ink }}>
      <div className="flex animate-[mc-marquee_28s_linear_infinite] gap-10 whitespace-nowrap">
        {[...items, ...items, ...items].map((it, i) => (
          <span key={i} className="font-display text-3xl sm:text-4xl" style={{ color: C.ink }}>
            {it} <span className="opacity-50">✦</span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes mc-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
      `}</style>
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
      <div className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]`} style={{ color: C.orange }}>
        <span className="h-px w-8" style={{ background: C.orange }} />
        {kicker}
      </div>
      <h2 className="mt-3 font-display leading-[0.95]" style={{ color: ink, fontSize: "clamp(2rem, 5vw, 3.6rem)" }}>
        {title}
      </h2>
    </div>
  );
}

// ---------- Before/After ----------
function BeforeAfter() {
  const cases = [
    { room: "Køkken", before: "#7c6f5a", after: "#e6dcc4", time: "2t 15m" },
    { room: "Badeværelse", before: "#5d6f72", after: "#cfe3e6", time: "1t 40m" },
    { room: "Stue", before: "#6e5a4a", after: "#e8d9c4", time: "2t 00m" },
  ];
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.cream }}>
      <BubbleField />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeader
            kicker="№ 02 — Bevis i billeder"
            title={
              <>
                Før. Efter. <span className="italic" style={{ color: C.orange }}>Wow.</span>
              </>
            }
          />
          <p className="max-w-md font-editorial text-base opacity-70" style={{ color: C.ink }}>
            Hver opgave dokumenteres med billeder. Du ved præcis hvad du har betalt for.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {cases.map((c, i) => (
            <motion.div
              key={c.room}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              custom={i}
              className="overflow-hidden rounded-3xl border-2 bg-white shadow-[6px_6px_0_rgba(10,61,58,0.12)]"
              style={{ borderColor: C.ink }}
            >
              <div className="relative grid grid-cols-2">
                <div className="flex aspect-[4/5] items-end p-4" style={{ background: c.before }}>
                  <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                    Før
                  </span>
                </div>
                <div className="flex aspect-[4/5] items-end p-4" style={{ background: c.after }}>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
                    style={{ background: C.orange, color: C.ink }}
                  >
                    Efter
                  </span>
                </div>
                <div aria-hidden className="absolute inset-y-0 left-1/2 w-0.5" style={{ background: C.cream }} />
              </div>
              <div className="flex items-center justify-between border-t-2 border-dashed p-4" style={{ borderColor: `${C.ink}25` }}>
                <span className="font-display text-xl" style={{ color: C.ink }}>{c.room}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider opacity-70">
                  <Wind className="h-3.5 w-3.5" /> {c.time}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Cleaners ----------
function Cleaners() {
  const cleaners = [
    { name: "Sofia M.", area: "København K", rating: 4.95, jobs: 142, rate: 280, color: "#ff6b35", tag: "Top pick" },
    { name: "Anders L.", area: "Aarhus C", rating: 4.92, jobs: 98, rate: 260, color: "#168a7a", tag: "Pålidelig" },
    { name: "Maja H.", area: "Frederiksberg", rating: 4.98, jobs: 211, rate: 320, color: "#0a3d3a", tag: "Eco-pro" },
    { name: "Pawel K.", area: "Odense", rating: 4.89, jobs: 67, rate: 240, color: "#c9a84c", tag: "Hurtig" },
  ];
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.ink }}>
      <BubbleField tone="ink" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeader
            kicker="№ 03 — Mød holdet"
            tone="dark"
            title={
              <>
                Ikke en algoritme.{" "}
                <span className="italic" style={{ color: C.mint }}>Mennesker.</span>
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
              className="group relative overflow-hidden rounded-3xl border"
              style={{ borderColor: `${C.cream}20`, background: `${C.cream}08` }}
            >
              <div
                className="relative flex aspect-[4/5] items-end p-5"
                style={{ background: `linear-gradient(160deg, ${c.color} 0%, ${C.ink} 130%)` }}
              >
                <span
                  className="font-display"
                  style={{ color: C.cream, fontSize: "clamp(3.5rem, 8vw, 5.5rem)", lineHeight: 0.9 }}
                >
                  {c.name.split(" ")[0][0]}
                  {c.name.split(" ")[1][0]}
                </span>
                <span
                  className="absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider shadow"
                  style={{ background: C.cream, color: C.ink }}
                >
                  ★ {c.rating}
                </span>
                <span
                  className="absolute left-3 top-3 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em]"
                  style={{ borderColor: C.cream, color: C.cream, background: "rgba(0,0,0,0.25)" }}
                >
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
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Testimonial ----------
function Testimonial() {
  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.mint }}>
      <Quote
        aria-hidden
        className="absolute -left-6 -top-6 h-44 w-44 opacity-15"
        style={{ color: C.ink }}
        strokeWidth={1}
      />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: C.ink }}>
          <span className="h-px w-8" style={{ background: C.ink }} /> Stemmer fra hjemmene
        </div>
        <p
          className="mt-6 font-display italic leading-[1.1]"
          style={{ color: C.ink, fontSize: "clamp(1.6rem, 4vw, 2.6rem)" }}
        >
          "Endelig en service hvor jeg ved hvem der kommer i mit hjem — og hvor cleaneren får en ærlig løn. MyCleaner føles bare rigtigt."
        </p>
        <div className="mt-8 inline-flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full font-display text-sm" style={{ background: C.ink, color: C.cream }}>LJ</div>
          <div className="text-left">
            <div className="font-bold" style={{ color: C.ink }}>Line Jakobsen</div>
            <div className="text-xs uppercase tracking-wider opacity-70" style={{ color: C.ink }}>Kunde · Nørrebro</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Process ----------
function Process() {
  const steps = [
    { n: "01", title: "Beskriv opgaven", body: "Antal m², frekvens og særlige ønsker. Tager 60 sekunder.", icon: <Sparkles className="h-5 w-5" /> },
    { n: "02", title: "Vælg cleaner", body: "Se profiler, anmeldelser og timepris. Du bestemmer.", icon: <Users className="h-5 w-5" /> },
    { n: "03", title: "Rent på gentag", body: "Book engangs eller fast aftale. Betal sikkert via MyCleaner.", icon: <Repeat className="h-5 w-5" /> },
  ];
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-10" style={{ background: C.cream }}>
      <BubbleField />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeader
          kicker="№ 04 — Sådan virker det"
          title={
            <>
              Tre skridt. Nul bøvl.{" "}
              <span className="italic" style={{ color: C.orange }}>Hjem rent.</span>
            </>
          }
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={i}
              className="relative rounded-3xl border-2 bg-white p-7 shadow-[6px_6px_0_rgba(10,61,58,0.12)]"
              style={{ borderColor: C.ink }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-6xl" style={{ color: C.orange }}>{s.n}</span>
                <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: C.ink, color: C.cream }}>
                  {s.icon}
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl" style={{ color: C.ink }}>{s.title}</h3>
              <p className="mt-2 text-sm opacity-70" style={{ color: C.ink }}>{s.body}</p>
            </motion.div>
          ))}
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
        <Stamp rotate={-3} color={C.ink}>★ Garanteret rent</Stamp>
        <h2 className="mt-5 font-display leading-[0.95]" style={{ color: C.ink, fontSize: "clamp(2.4rem, 7vw, 5rem)" }}>
          Klar til et <span className="italic">virkelig</span> rent hjem?
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-editorial text-base sm:text-lg" style={{ color: `${C.ink}cc` }}>
          Få et tilbud på under et minut. Ingen binding. Ingen overraskelser.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/task/create"
            className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold uppercase tracking-wider shadow-[6px_6px_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5"
            style={{ background: C.ink, color: C.cream }}
          >
            Book rengøring <ArrowUpRight className="h-4 w-4" />
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
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Sikker betaling</span>
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
      <BeforeAfter />
      <Cleaners />
      <Testimonial />
      <Process />
      <FinalCTA />
      <footer className="px-4 py-10 text-center text-xs sm:px-6" style={{ background: C.ink, color: `${C.cream}99` }}>
        © {new Date().getFullYear()} MyCleaner™ · Et HomeHero-brand · Made with bubbles in Denmark
      </footer>
    </main>
  );
}
