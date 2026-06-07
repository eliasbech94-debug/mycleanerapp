import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowUpRight,
  Star,
  Shield,
  Clock,
  CheckCircle2,
  Calculator,
  Users,
  Repeat,
  Wind,
} from "lucide-react";

/**
 * MyCleaner — Bold & energisk forside
 * Palette: deep teal #0a3d3a, orange #ff6b35, cream #f5f0e0, teal #168a7a
 * Typography: DM Serif Display + Fira Sans (display/editorial)
 * Fokus: rengøring som hovedfokus
 */

const PALETTE = {
  ink: "#0a3d3a",
  orange: "#ff6b35",
  cream: "#f5f0e0",
  teal: "#168a7a",
};

// Platform-gebyr: 28% delt ligeligt mellem kunde og provider (14% / 14%)
const PLATFORM_FEE = 0.28;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

// ---------- HERO with calculator ----------
function Hero() {
  const [sqm, setSqm] = useState(70);
  const [rate, setRate] = useState(280); // provider timepris DKK
  const [hours, setHours] = useState(2);

  // simpel udregning: timer ≈ m² / 35 (minimum 1.5)
  const suggestedHours = useMemo(
    () => Math.max(1.5, Math.round((sqm / 35) * 2) / 2),
    [sqm]
  );
  const base = rate * (hours || suggestedHours);
  const customerPays = Math.round(base * (1 + PLATFORM_FEE / 2));
  const providerGets = Math.round(base * (1 - PLATFORM_FEE / 2));

  return (
    <section className="relative overflow-hidden" style={{ background: PALETTE.ink }}>
      {/* big editorial type background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-0 right-0 select-none whitespace-nowrap font-display leading-none opacity-[0.06]"
        style={{ color: PALETTE.cream, fontSize: "clamp(140px, 22vw, 360px)" }}
      >
        MYCLEANER
      </div>

      {/* orange blob */}
      <div
        aria-hidden
        className="absolute -right-24 top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: PALETTE.orange, opacity: 0.35 }}
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10 lg:pt-14">
        {/* top masthead */}
        <div
          className="flex items-center justify-between text-xs uppercase tracking-[0.25em]"
          style={{ color: PALETTE.cream }}
        >
          <span className="font-editorial">MyCleaner — Vol. I</span>
          <span className="hidden sm:inline">Et rent hjem. Uden bøvl.</span>
          <Link
            to="/login"
            className="rounded-full border px-3 py-1.5 transition hover:bg-white/10"
            style={{ borderColor: `${PALETTE.cream}55`, color: PALETTE.cream }}
          >
            Log ind
          </Link>
        </div>

        <div className="mt-10 grid gap-10 pb-16 lg:grid-cols-12 lg:gap-8 lg:pb-24">
          {/* Headline */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="lg:col-span-7"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider"
              style={{ background: `${PALETTE.orange}22`, color: PALETTE.orange }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Nyt i Danmark
            </span>
            <h1
              className="mt-5 font-display leading-[0.95] tracking-tight"
              style={{
                color: PALETTE.cream,
                fontSize: "clamp(2.6rem, 7vw, 5.4rem)",
              }}
            >
              Rent hjem.{" "}
              <span style={{ color: PALETTE.orange }}>Rigtige</span>{" "}
              mennesker.
              <br />
              <span className="italic" style={{ color: PALETTE.teal }}>
                Ærlige priser.
              </span>
            </h1>
            <p
              className="mt-6 max-w-xl font-editorial text-base sm:text-lg"
              style={{ color: `${PALETTE.cream}cc` }}
            >
              MyCleaner matcher dig med verificerede rengøringsfolk i dit
              område. Du bestemmer timepris og tidspunkt — vi sikrer kvalitet,
              betaling og forsikring.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/task/create"
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5"
                style={{ background: PALETTE.orange, color: PALETTE.ink }}
              >
                Book rengøring
                <ArrowUpRight className="h-4 w-4 transition group-hover:rotate-45" />
              </Link>
              <Link
                to="/provider/register"
                className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:bg-white/10"
                style={{ borderColor: PALETTE.cream, color: PALETTE.cream }}
              >
                Bliv cleaner
              </Link>
            </div>

            {/* trust row */}
            <div
              className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs"
              style={{ color: `${PALETTE.cream}99` }}
            >
              <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: PALETTE.teal }} />
                Forsikret & KYC-tjekket
              </span>
              <span className="inline-flex items-center gap-2">
                <Star className="h-4 w-4" style={{ color: PALETTE.orange }} />
                4.9 i snit (2.140 jobs)
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: PALETTE.cream }} />
                Klar inden for 24t
              </span>
            </div>
          </motion.div>

          {/* Calculator card */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            custom={2}
            className="lg:col-span-5"
          >
            <div
              className="rounded-3xl p-6 shadow-2xl sm:p-7"
              style={{ background: PALETTE.cream, color: PALETTE.ink }}
            >
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <Calculator className="h-4 w-4" />
                  Pris­beregner
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: PALETTE.orange, color: PALETTE.ink }}
                >
                  Live
                </span>
              </div>

              <div className="mt-5 space-y-5">
                <Range
                  label="Boligstørrelse"
                  value={sqm}
                  setValue={setSqm}
                  min={20}
                  max={250}
                  step={5}
                  suffix="m²"
                />
                <Range
                  label="Providerens timepris"
                  value={rate}
                  setValue={setRate}
                  min={180}
                  max={500}
                  step={10}
                  suffix=" kr/t"
                />
                <Range
                  label={`Antal timer (foreslået: ${suggestedHours}t)`}
                  value={hours}
                  setValue={setHours}
                  min={1}
                  max={8}
                  step={0.5}
                  suffix="t"
                />
              </div>

              <div
                className="mt-6 rounded-2xl p-4"
                style={{ background: PALETTE.ink, color: PALETTE.cream }}
              >
                <div className="flex items-end justify-between">
                  <span className="text-xs uppercase tracking-wider opacity-70">
                    Du betaler
                  </span>
                  <span className="font-display text-4xl">
                    {customerPays.toLocaleString("da-DK")} kr
                  </span>
                </div>
                <div
                  className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs"
                  style={{ borderColor: `${PALETTE.cream}22` }}
                >
                  <div>
                    <div className="opacity-60">Cleaner modtager</div>
                    <div className="font-semibold">
                      {providerGets.toLocaleString("da-DK")} kr
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">Platformsgebyr</div>
                    <div className="font-semibold">28% (delt ligeligt)</div>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed opacity-70">
                Den endelige pris afhænger af providerens egen timepris. Vi
                lægger 14% oveni til dig og trækker 14% fra cleaneren — så
                bærer vi byrden sammen.
              </p>
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
        <span className="text-xs font-medium uppercase tracking-wider opacity-70">
          {label}
        </span>
        <span className="font-display text-lg">
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
        className="mt-1 w-full cursor-pointer accent-[color:var(--mc-orange)]"
        style={{ ["--mc-orange" as any]: PALETTE.orange }}
      />
    </label>
  );
}

// ---------- Marquee strip ----------
function Marquee() {
  const items = [
    "Ugentlig",
    "14-dages",
    "Månedlig",
    "Engangs",
    "Flytte­rengøring",
    "Vinduespudsning",
    "Hovedrengøring",
    "Erhverv",
  ];
  return (
    <div
      className="overflow-hidden border-y py-4"
      style={{ background: PALETTE.cream, borderColor: `${PALETTE.ink}15` }}
    >
      <div className="flex animate-[marquee_30s_linear_infinite] gap-12 whitespace-nowrap">
        {[...items, ...items, ...items].map((it, i) => (
          <span
            key={i}
            className="font-display text-2xl sm:text-3xl"
            style={{ color: PALETTE.ink }}
          >
            {it}{" "}
            <span style={{ color: PALETTE.orange }}>✦</span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
}

// ---------- Before/After ----------
function BeforeAfter() {
  const cases = [
    { room: "Køkken", before: "#7c6f5a", after: "#e6dcc4" },
    { room: "Badeværelse", before: "#5d6f72", after: "#cfe3e6" },
    { room: "Stue", before: "#6e5a4a", after: "#e8d9c4" },
  ];
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-10" style={{ background: PALETTE.cream }}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.orange }}>
              Bevis i billeder
            </span>
            <h2
              className="mt-2 font-display leading-[0.95]"
              style={{ color: PALETTE.ink, fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
            >
              Før. Efter. <span className="italic">Wow.</span>
            </h2>
          </div>
          <p className="max-w-md font-editorial text-base opacity-70" style={{ color: PALETTE.ink }}>
            Hver opgave dokumenteres med billeder, så du ved præcis hvad du har betalt for.
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
              className="overflow-hidden rounded-3xl border"
              style={{ borderColor: `${PALETTE.ink}15`, background: "#fff" }}
            >
              <div className="relative grid grid-cols-2">
                <div
                  className="flex aspect-[4/5] items-end p-4"
                  style={{ background: c.before }}
                >
                  <span className="rounded-full bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Før
                  </span>
                </div>
                <div
                  className="flex aspect-[4/5] items-end p-4"
                  style={{ background: c.after }}
                >
                  <span
                    className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: PALETTE.orange, color: PALETTE.ink }}
                  >
                    Efter
                  </span>
                </div>
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px"
                  style={{ background: PALETTE.cream }}
                />
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="font-display text-xl" style={{ color: PALETTE.ink }}>
                  {c.room}
                </span>
                <span className="inline-flex items-center gap-1 text-xs opacity-60">
                  <Wind className="h-3.5 w-3.5" /> 2t 15m
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
    { name: "Sofia M.", area: "København K", rating: 4.95, jobs: 142, color: "#ff6b35" },
    { name: "Anders L.", area: "Aarhus C", rating: 4.92, jobs: 98, color: "#168a7a" },
    { name: "Maja H.", area: "Frederiksberg", rating: 4.98, jobs: 211, color: "#0a3d3a" },
    { name: "Pawel K.", area: "Odense", rating: 4.89, jobs: 67, color: "#c9a84c" },
  ];
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-10" style={{ background: PALETTE.ink }}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.orange }}>
              Mød holdet
            </span>
            <h2
              className="mt-2 font-display leading-[0.95]"
              style={{ color: PALETTE.cream, fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
            >
              Ikke et algoritme.{" "}
              <span className="italic" style={{ color: PALETTE.teal }}>
                Mennesker.
              </span>
            </h2>
          </div>
          <Link
            to="/task/create"
            className="inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: PALETTE.orange }}
          >
            Find din cleaner <ArrowUpRight className="h-4 w-4" />
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
              className="group overflow-hidden rounded-3xl"
              style={{ background: `${PALETTE.cream}0d` }}
            >
              <div
                className="relative flex aspect-square items-end p-4"
                style={{
                  background: `linear-gradient(135deg, ${c.color} 0%, ${PALETTE.ink} 120%)`,
                }}
              >
                <span
                  className="font-display"
                  style={{ color: PALETTE.cream, fontSize: "clamp(3.5rem, 8vw, 5.5rem)", lineHeight: 0.9 }}
                >
                  {c.name.split(" ")[0][0]}
                  {c.name.split(" ")[1][0]}
                </span>
                <span
                  className="absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: PALETTE.cream, color: PALETTE.ink }}
                >
                  ★ {c.rating}
                </span>
              </div>
              <div className="p-4" style={{ color: PALETTE.cream }}>
                <div className="font-display text-xl">{c.name}</div>
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

// ---------- Process ----------
function Process() {
  const steps = [
    {
      n: "01",
      title: "Beskriv opgaven",
      body: "Antal m², frekvens og særlige ønsker. Tager 60 sekunder.",
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      n: "02",
      title: "Vælg cleaner",
      body: "Se profiler, anmeldelser og timepris. Du bestemmer.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      n: "03",
      title: "Rent hjem — på gentag",
      body: "Book engangs eller fast aftale. Betal sikkert via MyCleaner.",
      icon: <Repeat className="h-5 w-5" />,
    },
  ];
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-10" style={{ background: PALETTE.cream }}>
      <div className="mx-auto max-w-7xl">
        <h2
          className="max-w-3xl font-display leading-[0.95]"
          style={{ color: PALETTE.ink, fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          Tre skridt. Nul bøvl.{" "}
          <span className="italic" style={{ color: PALETTE.orange }}>
            Hjem rent.
          </span>
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={i}
              className="rounded-3xl border p-6"
              style={{ borderColor: `${PALETTE.ink}15`, background: "#fff" }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-display text-5xl"
                  style={{ color: PALETTE.orange }}
                >
                  {s.n}
                </span>
                <span
                  className="rounded-full p-2"
                  style={{ background: PALETTE.ink, color: PALETTE.cream }}
                >
                  {s.icon}
                </span>
              </div>
              <h3
                className="mt-6 font-display text-2xl"
                style={{ color: PALETTE.ink }}
              >
                {s.title}
              </h3>
              <p className="mt-2 text-sm opacity-70" style={{ color: PALETTE.ink }}>
                {s.body}
              </p>
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
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-10" style={{ background: PALETTE.orange }}>
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-0 right-0 select-none whitespace-nowrap font-display leading-none opacity-10"
        style={{ color: PALETTE.ink, fontSize: "clamp(120px, 20vw, 320px)" }}
      >
        MYCLEANER
      </div>
      <div className="relative mx-auto max-w-5xl text-center">
        <h2
          className="font-display leading-[0.95]"
          style={{ color: PALETTE.ink, fontSize: "clamp(2.4rem, 7vw, 5rem)" }}
        >
          Klar til et{" "}
          <span className="italic">virkelig</span> rent hjem?
        </h2>
        <p
          className="mx-auto mt-5 max-w-xl font-editorial text-base sm:text-lg"
          style={{ color: `${PALETTE.ink}cc` }}
        >
          Få et tilbud på under et minut. Ingen binding. Ingen overraskelser.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/task/create"
            className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition hover:-translate-y-0.5"
            style={{ background: PALETTE.ink, color: PALETTE.cream }}
          >
            Book rengøring <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/provider/register"
            className="inline-flex items-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold transition hover:bg-black/5"
            style={{ borderColor: PALETTE.ink, color: PALETTE.ink }}
          >
            Bliv cleaner
          </Link>
        </div>
        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs"
          style={{ color: `${PALETTE.ink}aa` }}
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Ingen binding
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Sikker betaling
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Tilfredshedsgaranti
          </span>
        </div>
      </div>
    </section>
  );
}

export default function Index() {
  return (
    <main
      className="min-h-screen font-editorial"
      style={{ background: PALETTE.cream }}
    >
      <Hero />
      <Marquee />
      <BeforeAfter />
      <Cleaners />
      <Process />
      <FinalCTA />
      <footer
        className="px-4 py-10 text-center text-xs sm:px-6"
        style={{ background: PALETTE.ink, color: `${PALETTE.cream}99` }}
      >
        © {new Date().getFullYear()} MyCleaner · Et HomeHero-brand · Made in
        Denmark
      </footer>
    </main>
  );
}
