import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Shield,
  Sparkles,
  Zap,
  Star,
  CheckCircle2,
  Activity,
  MapPin,
  Clock,
  Plus,
} from "lucide-react";
import { serviceCategories } from "@/lib/countries";
import Tilt from "@/components/Tilt";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] },
  }),
};

/* ───────────────────────── HERO ───────────────────────── */
const Hero = () => (
  <section className="relative isolate overflow-hidden bg-[hsl(220_25%_6%)] text-white">
    {/* mesh blobs */}
    <div className="mesh-blob -top-32 -left-20 h-[420px] w-[420px] bg-[hsl(168_85%_45%)]" />
    <div className="mesh-blob top-40 -right-32 h-[480px] w-[480px] bg-[hsl(200_90%_50%)]" />
    <div className="mesh-blob bottom-0 left-1/3 h-[360px] w-[360px] bg-[hsl(32_95%_55%)] opacity-40" />
    {/* grid + noise */}
    <div className="absolute inset-0 bg-grid" />
    <div className="absolute inset-0 bg-noise opacity-[0.18] mix-blend-overlay" />

    <div className="container-wide relative pt-16 pb-20 md:pt-32 md:pb-44">
      {/* status pill */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="flex justify-center mb-6 md:mb-10"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur px-3 py-1 md:px-4 md:py-1.5 text-[11px] md:text-xs font-medium text-white/80 max-w-full">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="pulse-dot absolute inline-flex h-full w-full" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(152_80%_55%)]" />
          </span>
          <span className="truncate">1 248 opgaver i dag · 12 lande live</span>
        </div>
      </motion.div>

      {/* Display headline */}
      <motion.h1
        initial="hidden"
        animate="visible"
        custom={1}
        variants={fadeUp}
        className="font-heading text-center font-bold tracking-[-0.04em] leading-[0.92] text-[clamp(2.5rem,13vw,9rem)]"
      >
        Home<span className="text-outline">service</span>
        <br />
        <span className="inline-flex items-center gap-2 md:gap-6">
          re
          <span className="inline-block bg-gradient-to-br from-[hsl(168_80%_55%)] via-[hsl(180_85%_55%)] to-[hsl(200_90%_60%)] bg-clip-text text-transparent">
            ·imagined
          </span>
        </span>
      </motion.h1>

      <motion.p
        initial="hidden"
        animate="visible"
        custom={2}
        variants={fadeUp}
        className="mx-auto mt-6 md:mt-8 max-w-xl text-center text-sm md:text-lg text-white/65 leading-relaxed px-2"
      >
        AI-matchet. Fair betalt. Verificeret. HomeHero forbinder dig med Europas dygtigste fagfolk — uden budkrig.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial="hidden"
        animate="visible"
        custom={3}
        variants={fadeUp}
        className="mt-8 md:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
      >
        <Link to="/task/create" className="w-full sm:w-auto">
          <Button
            size="lg"
            className="w-full sm:w-auto h-12 md:h-13 px-7 text-base bg-white text-[hsl(220_25%_6%)] hover:bg-white/90 rounded-full gap-2 shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)]"
          >
            Opret opgave gratis <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link to="/provider/register" className="w-full sm:w-auto">
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto h-12 md:h-13 px-7 text-base bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white rounded-full backdrop-blur"
          >
            Bliv provider
          </Button>
        </Link>
      </motion.div>

      {/* Floating estimator card */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="relative mt-12 md:mt-20 mx-auto max-w-3xl"
      >
        <Tilt max={8} scale={1.015} className="floaty rounded-2xl md:rounded-3xl">
          <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 md:p-8 shadow-[0_30px_120px_-20px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between mb-5 md:mb-6">
              <div className="flex items-center gap-2 text-[10px] md:text-xs font-mono uppercase tracking-widest text-white/50">
                <Activity className="h-3 w-3 md:h-3.5 md:w-3.5 text-[hsl(168_80%_55%)]" />
                live ai estimator
              </div>
              <div className="text-[10px] font-mono text-white/40">v2.6 · eu</div>
            </div>

            <div className="grid md:grid-cols-2 gap-5 md:gap-6">
              <div>
                <div className="text-xs text-white/50 mb-2">Opgave</div>
                <div className="font-heading text-xl md:text-3xl font-semibold leading-tight">
                  Hovedrengøring,<br />85 m² · København
                </div>
                <div className="mt-3 md:mt-4 flex flex-wrap gap-1.5 md:gap-2">
                  {["3 timer", "2 fagfolk", "I morgen 09:00"].map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 md:px-2.5 md:py-1 text-[11px] md:text-xs text-white/70"
                    >
                      <Clock className="h-3 w-3" /> {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl md:rounded-2xl bg-gradient-to-br from-[hsl(168_70%_25%)]/40 to-[hsl(200_70%_25%)]/40 border border-white/10 p-4 md:p-5">
                <div className="text-xs text-white/60 mb-1">AI prisforslag</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading text-3xl md:text-5xl font-bold tabular-nums">1 240</span>
                  <span className="text-white/50 text-sm">DKK</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-3/5 bg-gradient-to-r from-[hsl(168_80%_55%)] to-[hsl(200_85%_60%)]" />
                </div>
                <div className="mt-2 flex justify-between text-[10px] md:text-[11px] font-mono text-white/45">
                  <span>min 980</span>
                  <span>marked</span>
                  <span>max 1 480</span>
                </div>
              </div>
            </div>
          </div>
        </Tilt>

        {/* Pinned badges */}
        <div className="hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 -rotate-6 items-center gap-2 rounded-2xl bg-[hsl(32_95%_55%)] text-[hsl(220_25%_6%)] px-3 py-2 text-xs font-bold shadow-xl">
          <Sparkles className="h-3.5 w-3.5" /> NO BIDDING WAR
        </div>
        <div className="hidden md:flex absolute -right-4 -top-4 rotate-6 items-center gap-2 rounded-2xl bg-white text-[hsl(220_25%_6%)] px-3 py-2 text-xs font-bold shadow-xl">
          <Shield className="h-3.5 w-3.5" /> KYC VERIFIED
        </div>
      </motion.div>
    </div>

    {/* Marquee */}
    <div className="relative border-y border-white/10 bg-black/30 backdrop-blur py-3 md:py-5 overflow-hidden">
      <div className="ticker-track flex gap-8 md:gap-12 whitespace-nowrap font-heading font-semibold text-lg md:text-4xl text-white/30 uppercase tracking-tight">
        {Array.from({ length: 2 }).flatMap((_, k) =>
          ["Rengøring", "★", "Håndværk", "★", "Have & udendørs", "★", "Flytning", "★", "VVS", "★", "Maler", "★", "Vinduer", "★"].map((w, i) => (
            <span key={`${k}-${i}`} className={i % 2 === 1 ? "text-[hsl(168_80%_55%)]" : ""}>{w}</span>
          ))
        )}
      </div>
    </div>
  </section>
);

/* ───────────────────────── BENTO ───────────────────────── */
const Bento = () => (
  <section className="section-padding bg-background">
    <div className="container-wide">
      <div className="flex items-end justify-between mb-8 md:mb-14 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] md:text-xs font-mono uppercase tracking-widest text-primary mb-2 md:mb-3">/ 01 — services</div>
          <h2 className="font-heading text-3xl md:text-6xl font-bold tracking-tight leading-[0.95] max-w-2xl">
            Alt dit hjem behøver. <span className="text-muted-foreground/50">På én platform.</span>
          </h2>
        </div>
        <Link to="/services" className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors">
          Se alle <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Asymmetric bento */}
      <div className="grid grid-cols-12 auto-rows-[160px] sm:auto-rows-[180px] md:auto-rows-[220px] gap-2.5 md:gap-4">
        {serviceCategories.map((cat, i) => {
          const layouts = [
            "col-span-12 md:col-span-7 row-span-2",
            "col-span-12 md:col-span-5 row-span-1",
            "col-span-6 md:col-span-5 row-span-1",
            "col-span-6 md:col-span-7 row-span-1",
          ];
          const tones = [
            "bg-[hsl(220_25%_8%)] text-white",
            "bg-[hsl(168_45%_92%)] text-[hsl(220_25%_10%)]",
            "bg-[hsl(32_95%_92%)] text-[hsl(220_25%_10%)]",
            "bg-[hsl(220_15%_94%)] text-[hsl(220_25%_10%)]",
          ];
          return (
            <motion.div
              key={cat.id}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              custom={i}
              variants={fadeUp}
              className={`${layouts[i]}`}
            >
              <Tilt max={12} scale={1.03} className={`relative h-full w-full overflow-hidden rounded-2xl md:rounded-3xl ${tones[i]} group cursor-pointer`}>
                <Link to={`/task/create`} className="absolute inset-0 p-4 md:p-8 flex flex-col justify-between" data-cursor="hover">
                  <div className="flex items-start justify-between">
                    <span className="text-3xl md:text-6xl">{cat.icon}</span>
                    <div className="h-7 w-7 md:h-9 md:w-9 rounded-full border border-current/20 flex items-center justify-center group-hover:rotate-45 transition-transform duration-500">
                      <ArrowUpRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-heading text-lg md:text-3xl font-bold tracking-tight mb-1 leading-tight">
                      {cat.name}
                    </h3>
                    <p className="hidden md:block text-sm opacity-70 mb-3 max-w-md">{cat.description}</p>
                    <div className="hidden sm:flex flex-wrap gap-1.5">
                      {cat.subcategories.slice(0, 3).map((sub) => (
                        <span key={sub} className="text-[11px] font-medium border border-current/20 rounded-full px-2 py-0.5 opacity-80">
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </Tilt>
            </motion.div>
          );
        })}
      </div>
    </div>
  </section>
);

/* ───────────────────────── FLOW ───────────────────────── */
const Flow = () => {
  const steps = [
    { n: "01", title: "Beskriv din opgave", desc: "30 sekunder. Foto, adresse, ønsket tid. AI'en oversætter til en præcis brief." },
    { n: "02", title: "AI matcher fagfolk", desc: "Vi udvælger 3-5 verificerede providere baseret på lokation, anmeldelser og kapacitet." },
    { n: "03", title: "Book med fast pris", desc: "Sammenlign tilbud — alle inden for fair-market range. Betal sikkert via platformen." },
  ];
  return (
    <section className="section-padding bg-[hsl(220_25%_6%)] text-white relative overflow-hidden">
      <div className="mesh-blob top-1/4 -right-40 h-[400px] w-[400px] bg-[hsl(168_85%_45%)] opacity-30" />
      <div className="container-wide relative">
        <div className="text-[11px] md:text-xs font-mono uppercase tracking-widest text-[hsl(168_80%_55%)] mb-2 md:mb-3">/ 02 — flow</div>
        <h2 className="font-heading text-3xl md:text-6xl font-bold tracking-tight leading-[0.95] max-w-3xl mb-10 md:mb-16">
          Fra idé til udført opgave. <span className="text-white/40">Tre skridt.</span>
        </h2>

        <div className="grid md:grid-cols-3 gap-px bg-white/10 rounded-2xl md:rounded-3xl overflow-hidden border border-white/10">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              variants={fadeUp}
              className="bg-[hsl(220_25%_6%)] p-6 md:p-10 hover:bg-[hsl(220_25%_8%)] transition-colors"
            >
              <div className="flex items-center justify-between mb-8 md:mb-12">
                <span className="font-mono text-sm text-white/50">{s.n}</span>
                <Plus className="h-4 w-4 text-white/30" />
              </div>
              <h3 className="font-heading text-xl md:text-2xl font-semibold mb-2 md:mb-3">{s.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── STATS ───────────────────────── */
const Stats = () => {
  const items = [
    { v: "12+", l: "Lande live", sub: "Hele Norden, DACH, Benelux" },
    { v: "0", l: "Budkrige", sub: "Fair-market AI prissætning" },
    { v: "25%", l: "Platformgebyr", sub: "Delt mellem kunde og provider" },
    { v: "100%", l: "Overenskomstløn", sub: "Min. sats per land" },
  ];
  return (
    <section className="py-16 md:py-28 bg-background">
      <div className="container-wide">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-2xl md:rounded-3xl overflow-hidden border border-border">
          {items.map((it, i) => (
            <motion.div
              key={it.l}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              variants={fadeUp}
              className="bg-card p-5 md:p-8 group hover:bg-secondary/50 transition-colors"
            >
              <div className="font-heading text-3xl md:text-6xl font-bold tracking-tight tabular-nums text-primary mb-1.5 md:mb-2 group-hover:scale-105 origin-left transition-transform">
                {it.v}
              </div>
              <div className="font-medium text-sm md:text-base text-foreground mb-1">{it.l}</div>
              <div className="text-[11px] md:text-xs text-muted-foreground">{it.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── TRUST / PROVIDER ───────────────────────── */
const ProviderTease = () => (
  <section className="section-padding bg-secondary/40">
    <div className="container-wide">
      <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
        <div>
          <div className="text-[11px] md:text-xs font-mono uppercase tracking-widest text-primary mb-2 md:mb-3">/ 03 — for providere</div>
          <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight leading-[0.95] mb-4 md:mb-6">
            Byg din forretning. <span className="text-muted-foreground/60">Vi finder kunderne.</span>
          </h2>
          <p className="text-muted-foreground text-sm md:text-lg leading-relaxed mb-6 md:mb-8 max-w-md">
            Privat eller virksomhed. Boost din profil, vælg dine områder, og lad AI'en sende dig de rigtige opgaver — til den rigtige pris.
          </p>
          <div className="space-y-3 mb-8">
            {[
              "Gratis profil for private udbydere",
              "Virksomhedsplan med kvartalsvis abonnement",
              "Boost-funktion for ekstra synlighed",
              "Garanteret minimumssats per land",
            ].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm">{t}</span>
              </div>
            ))}
          </div>
          <Link to="/provider/register">
            <Button size="lg" className="rounded-full h-12 px-7 gap-2">
              Opret provider-profil <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="relative">
          <div className="rounded-2xl md:rounded-3xl bg-[hsl(220_25%_6%)] text-white p-5 md:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5 md:mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-full bg-gradient-to-br from-[hsl(168_80%_55%)] to-[hsl(200_85%_60%)] flex items-center justify-center font-bold text-[hsl(220_25%_6%)]">
                  M
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">Maria K.</div>
                  <div className="text-xs text-white/50 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Aarhus C
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm shrink-0">
                <Star className="h-4 w-4 text-[hsl(38_92%_60%)] fill-current" /> 4.96
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5 md:mb-6">
              {[
                { l: "Opgaver", v: "247" },
                { l: "Indkomst", v: "82k" },
                { l: "Genbook", v: "78%" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg md:rounded-xl bg-white/5 border border-white/10 p-2.5 md:p-3">
                  <div className="font-heading font-bold text-lg md:text-xl tabular-nums">{s.v}</div>
                  <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-white/50 mt-1">{s.l}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[hsl(168_80%_55%)]/40 bg-[hsl(168_80%_55%)]/10 p-3 md:p-4 flex items-center gap-3">
              <Zap className="h-5 w-5 text-[hsl(168_80%_55%)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] md:text-xs text-white/60">Næste opgave</div>
                <div className="text-xs md:text-sm font-medium truncate">Vinduespudsning · 320 DKK · 1.2 km</div>
              </div>
              <Button size="sm" className="bg-white text-[hsl(220_25%_6%)] hover:bg-white/90 rounded-full h-8 shrink-0">
                Se
              </Button>
            </div>
          </div>

          <div className="absolute -bottom-3 -right-2 md:-bottom-4 md:-right-4 rotate-3 bg-[hsl(32_95%_55%)] text-[hsl(220_25%_6%)] rounded-xl md:rounded-2xl px-2.5 py-1.5 md:px-3 md:py-2 text-[10px] md:text-xs font-bold shadow-xl">
            +EARN 18% W/W
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ───────────────────────── FINAL CTA ───────────────────────── */
const FinalCTA = () => (
  <section className="py-16 md:py-32 bg-background">
    <div className="container-wide">
      <div className="relative overflow-hidden rounded-[1.5rem] md:rounded-[3rem] bg-[hsl(220_25%_6%)] text-white p-8 md:p-20 text-center">
        <div className="mesh-blob -top-20 left-1/4 h-[300px] w-[300px] bg-[hsl(168_85%_45%)] opacity-50" />
        <div className="mesh-blob bottom-0 right-1/4 h-[300px] w-[300px] bg-[hsl(200_90%_50%)] opacity-50" />
        <div className="absolute inset-0 bg-grid opacity-50" />

        <div className="relative">
          <h2 className="font-heading text-4xl md:text-7xl font-bold tracking-[-0.04em] leading-[0.95] mb-4 md:mb-6">
            Klar når <span className="text-outline">du</span> er.
          </h2>
          <p className="text-white/60 text-sm md:text-base max-w-md mx-auto mb-8 md:mb-10">
            Opret en gratis profil på under 2 minutter. Søg hjælp eller tilbyd dine services.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/customer/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto rounded-full h-12 md:h-13 px-8 bg-white text-[hsl(220_25%_6%)] hover:bg-white/90">
                Jeg søger hjælp
              </Button>
            </Link>
            <Link to="/provider/register" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full h-12 md:h-13 px-8 bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
                Jeg tilbyder hjælp
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Index = () => (
  <div>
    <Hero />
    <Bento />
    <Flow />
    <Stats />
    <ProviderTease />
    <FinalCTA />
  </div>
);

export default Index;
