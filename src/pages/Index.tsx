import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Shield,
  Sparkles,
  Star,
  Activity,
  Clock,
  CheckCircle2,
  MapPin,
  Quote,
  Hammer,
  Leaf,
  Truck,
  Wrench,
  Calendar,
  Users,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] as const },
  }),
};

/* ─────────────── HERO (editorial split) ─────────────── */
const Hero = () => (
  <section className="relative bg-background text-foreground border-b border-border">
    <div className="container-wide pt-10 md:pt-16 pb-10 md:pb-20">
      {/* Editorial masthead */}
      <div className="flex items-center justify-between text-[10px] md:text-xs font-editorial uppercase tracking-[0.2em] text-muted-foreground mb-8 md:mb-14">
        <span>HomeHero — Vol. XII</span>
        <span className="hidden sm:inline">København · Stockholm · Berlin · Amsterdam</span>
        <span>Juni 2026</span>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end">
        {/* Left: editorial headline */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="lg:col-span-8">
          <div className="text-[11px] font-editorial uppercase tracking-[0.25em] text-primary mb-4 md:mb-6">
            №01 — Hjemmeservice, fortalt på ny
          </div>
          <h1 className="font-display font-normal italic-none text-[clamp(2.75rem,9vw,7.5rem)] leading-[0.92] tracking-[-0.02em] text-foreground">
            Et hjem,<br />
            passet af{" "}
            <span className="italic text-primary">de rigtige</span>{" "}
            <span className="text-muted-foreground/60">hænder.</span>
          </h1>
        </motion.div>

        {/* Right: editorial intro + CTAs */}
        <motion.div
          initial="hidden"
          animate="visible"
          custom={1}
          variants={fadeUp}
          className="lg:col-span-4 lg:border-l lg:border-border lg:pl-8"
        >
          <p className="font-editorial text-base md:text-lg leading-relaxed text-foreground/80 mb-6">
            HomeHero forbinder Europas hjem med dygtige, verificerede fagfolk. AI-matchet pris,
            ingen budkrig, fair betaling efter overenskomst.
          </p>
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
            <Link to="/task/create" className="flex-1">
              <Button size="lg" className="w-full h-12 rounded-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                Opret opgave <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/provider/register" className="flex-1">
              <Button size="lg" variant="outline" className="w-full h-12 rounded-full gap-2 border-foreground/20 hover:bg-foreground hover:text-background">
                Bliv provider <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex -space-x-1.5">
              {["MJ", "AS", "CP"].map((a) => (
                <div key={a} className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center border border-background">
                  {a}
                </div>
              ))}
            </div>
            <span>4 200+ aktive fagfolk · 12 lande</span>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

/* ─────────────── BENTO ─────────────── */
const services = [
  { id: "cleaning", name: "Rengøring", icon: Sparkles, count: "1 240 fagfolk" },
  { id: "handyman", name: "Håndværk", icon: Hammer, count: "860 fagfolk" },
  { id: "garden", name: "Have", icon: Leaf, count: "420 fagfolk" },
  { id: "moving", name: "Flytning", icon: Truck, count: "310 fagfolk" },
  { id: "plumbing", name: "VVS & el", icon: Wrench, count: "280 fagfolk" },
];

const Bento = () => (
  <section className="bg-secondary/40 border-b border-border">
    <div className="container-wide section-padding">
      <div className="grid grid-cols-12 gap-3 md:gap-4 auto-rows-[minmax(140px,auto)]">
        {/* 1 · Big editorial card — featured story */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} custom={0} variants={fadeUp}
          className="col-span-12 md:col-span-7 row-span-2 relative overflow-hidden rounded-3xl bg-[hsl(168_60%_12%)] text-[hsl(45_55%_92%)] p-6 md:p-10 flex flex-col justify-between min-h-[320px] md:min-h-[440px]"
        >
          <div className="absolute inset-0 opacity-30 bg-grid pointer-events-none" />
          <div className="relative">
            <div className="text-[10px] md:text-xs font-editorial uppercase tracking-[0.25em] text-[hsl(45_55%_92%)]/60 mb-4">
              Reportage · AI-prissætning
            </div>
            <h2 className="font-display text-3xl md:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.01em]">
              <span className="italic">"Endelig en fair pris,</span> uden at jagte fem tilbud."
            </h2>
          </div>
          <div className="relative flex items-end justify-between gap-4">
            <div className="font-editorial text-sm text-[hsl(45_55%_92%)]/70 max-w-xs">
              Vores AI beregner et fair-market interval ud fra opgavens omfang og lokal overenskomst.
              Du betaler aldrig for budkrige.
            </div>
            <Link to="/how-it-works" className="shrink-0 h-12 w-12 rounded-full bg-[hsl(45_55%_92%)] text-[hsl(168_60%_12%)] flex items-center justify-center hover:scale-105 transition-transform">
              <ArrowUpRight className="h-5 w-5" />
            </Link>
          </div>
        </motion.div>

        {/* 2 · Live ticker */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} custom={1} variants={fadeUp}
          className="col-span-12 md:col-span-5 rounded-3xl bg-background border border-border p-5 md:p-6 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 text-[10px] font-editorial uppercase tracking-[0.25em] text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" /> Live i dag
          </div>
          <div>
            <div className="font-display text-5xl md:text-6xl leading-none text-foreground tabular-nums">
              1 248
            </div>
            <div className="font-editorial text-sm text-muted-foreground mt-1">opgaver matchet siden midnat</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success animate-ping opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Opdateres hvert minut
          </div>
        </motion.div>

        {/* 3 · Quote */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} custom={2} variants={fadeUp}
          className="col-span-12 md:col-span-5 rounded-3xl bg-[hsl(45_55%_92%)] text-[hsl(168_60%_12%)] p-6 md:p-8 flex flex-col justify-between min-h-[200px]"
        >
          <Quote className="h-7 w-7 opacity-40" />
          <p className="font-display text-xl md:text-2xl leading-snug italic">
            "Jeg fik fat i en lokal håndværker på under to timer — og prisen var præcis det jeg havde forventet."
          </p>
          <div className="flex items-center gap-3 text-sm font-editorial">
            <div className="h-8 w-8 rounded-full bg-[hsl(168_60%_12%)]/10 flex items-center justify-center font-semibold">EL</div>
            <div>
              <div className="font-semibold">Emma L.</div>
              <div className="text-[hsl(168_60%_12%)]/60 text-xs">Frederiksberg</div>
            </div>
          </div>
        </motion.div>

        {/* 4 · Stat */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} custom={3} variants={fadeUp}
          className="col-span-6 md:col-span-3 rounded-3xl bg-primary text-primary-foreground p-5 md:p-6 flex flex-col justify-between"
        >
          <Star className="h-5 w-5 fill-current" />
          <div>
            <div className="font-display text-4xl md:text-5xl leading-none">4.92</div>
            <div className="font-editorial text-xs opacity-80 mt-1">gennemsnitlig rating</div>
          </div>
        </motion.div>

        {/* 5 · Stat */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} custom={4} variants={fadeUp}
          className="col-span-6 md:col-span-4 rounded-3xl bg-background border border-border p-5 md:p-6 flex flex-col justify-between"
        >
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <div className="font-display text-4xl md:text-5xl leading-none text-foreground">100%</div>
            <div className="font-editorial text-xs text-muted-foreground mt-1">KYC-verificerede fagfolk</div>
          </div>
        </motion.div>

        {/* 6 · Service strip */}
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} custom={5} variants={fadeUp}
          className="col-span-12 rounded-3xl bg-background border border-border p-5 md:p-6"
        >
          <div className="flex items-center justify-between mb-4 md:mb-5">
            <div className="text-[10px] md:text-xs font-editorial uppercase tracking-[0.25em] text-muted-foreground">
              Kategorier
            </div>
            <Link to="/services" className="text-xs font-editorial text-primary hover:underline">Se alle →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {services.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.id}
                  to="/task/create"
                  className="group flex items-center gap-3 p-3 md:p-4 rounded-2xl bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <div className="h-10 w-10 rounded-xl bg-background group-hover:bg-primary-foreground/15 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary group-hover:text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-editorial font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-[11px] opacity-60 truncate">{s.count}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

/* ─────────────── DUAL CTA (kunder / providere) ─────────────── */
const DualCTA = () => (
  <section className="bg-background border-b border-border">
    <div className="container-wide section-padding">
      <div className="text-center mb-10 md:mb-14">
        <div className="text-[11px] font-editorial uppercase tracking-[0.25em] text-primary mb-3">№02 — To veje, ét fællesskab</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[0.95] tracking-[-0.01em] max-w-3xl mx-auto">
          Uanset om du <span className="italic">bestiller</span> eller <span className="italic">arbejder</span>.
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        {/* Customer */}
        <div className="group relative overflow-hidden rounded-3xl bg-secondary p-6 md:p-10 flex flex-col">
          <div className="text-[10px] font-editorial uppercase tracking-[0.25em] text-muted-foreground mb-6">For kunder</div>
          <h3 className="font-display text-3xl md:text-4xl leading-tight mb-4">
            Beskriv opgaven. <span className="italic text-primary">Vi gør resten.</span>
          </h3>
          <ul className="space-y-3 mb-8 flex-1">
            {[
              { i: Calendar, t: "Book på minutter — fast pris fra start" },
              { i: Shield, t: "Verificerede, forsikrede fagfolk" },
              { i: Star, t: "Læs ægte anmeldelser fra naboer" },
            ].map(({ i: Ic, t }) => (
              <li key={t} className="flex items-start gap-3 font-editorial text-sm">
                <Ic className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <Link to="/customer/register">
            <Button size="lg" className="w-full sm:w-auto rounded-full h-12 px-6 gap-2">
              Opret opgave <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Provider */}
        <div className="group relative overflow-hidden rounded-3xl bg-[hsl(168_60%_12%)] text-[hsl(45_55%_92%)] p-6 md:p-10 flex flex-col">
          <div className="text-[10px] font-editorial uppercase tracking-[0.25em] opacity-60 mb-6">For providere</div>
          <h3 className="font-display text-3xl md:text-4xl leading-tight mb-4">
            Byg din forretning. <span className="italic opacity-80">Vi sender kunderne.</span>
          </h3>
          <ul className="space-y-3 mb-8 flex-1">
            {[
              { i: Users, t: "Gratis profil for private udbydere" },
              { i: CheckCircle2, t: "Garanteret minimumssats per land" },
              { i: MapPin, t: "Vælg dine områder og kapacitet" },
            ].map(({ i: Ic, t }) => (
              <li key={t} className="flex items-start gap-3 font-editorial text-sm">
                <Ic className="h-4 w-4 mt-0.5 shrink-0 opacity-90" />
                <span className="opacity-90">{t}</span>
              </li>
            ))}
          </ul>
          <Link to="/provider/register">
            <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full h-12 px-6 gap-2 bg-transparent border-[hsl(45_55%_92%)]/30 text-[hsl(45_55%_92%)] hover:bg-[hsl(45_55%_92%)] hover:text-[hsl(168_60%_12%)]">
              Bliv provider <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  </section>
);

/* ─────────────── FLOW ─────────────── */
const Flow = () => {
  const steps = [
    { n: "01", t: "Beskriv", d: "Foto, adresse, ønsket tid. Vores AI bygger en præcis brief på 30 sekunder." },
    { n: "02", t: "Match", d: "Tre til fem verificerede providere udvælges ud fra lokation, rating og kapacitet." },
    { n: "03", t: "Book", d: "Fast pris, sikker betaling, klar kommunikation — hele vejen til udført opgave." },
  ];
  return (
    <section className="bg-secondary/40 border-b border-border">
      <div className="container-wide section-padding">
        <div className="text-[11px] font-editorial uppercase tracking-[0.25em] text-primary mb-3">№03 — Sådan virker det</div>
        <h2 className="font-display text-4xl md:text-6xl leading-[0.95] tracking-[-0.01em] max-w-3xl mb-10 md:mb-14">
          Fra idé til <span className="italic">udført</span> opgave.
        </h2>

        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp}
              className="rounded-3xl bg-background border border-border p-6 md:p-8 flex flex-col gap-5 md:gap-8 min-h-[220px]"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-5xl md:text-6xl text-primary">{s.n}</span>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-display text-2xl md:text-3xl mb-2">{s.t}</h3>
                <p className="font-editorial text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────────────── FOOTER CTA ─────────────── */
const FinalCTA = () => (
  <section className="bg-background">
    <div className="container-wide py-16 md:py-28 text-center">
      <div className="text-[11px] font-editorial uppercase tracking-[0.25em] text-primary mb-4">№04 — Klar når du er</div>
      <h2 className="font-display text-5xl md:text-8xl leading-[0.9] tracking-[-0.02em] max-w-4xl mx-auto mb-8 md:mb-10">
        Hjælpen er <span className="italic text-primary">to klik væk.</span>
      </h2>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
        <Link to="/task/create" className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto h-12 px-8 rounded-full gap-2">
            Opret opgave <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link to="/provider/register" className="w-full sm:w-auto">
          <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 rounded-full gap-2">
            Bliv provider
          </Button>
        </Link>
      </div>
    </div>
  </section>
);

const Index = () => (
  <main className="bg-background">
    <Hero />
    <Bento />
    <DualCTA />
    <Flow />
    <FinalCTA />
  </main>
);

export default Index;
