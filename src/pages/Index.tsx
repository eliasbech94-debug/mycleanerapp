import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Star, Search, CheckCircle2, Sparkles } from "lucide-react";
import { serviceCategories } from "@/lib/countries";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

const HeroSection = () => (
  <section className="relative overflow-hidden">
    <div className="absolute inset-0 gradient-hero opacity-[0.03]" />
    <div className="container-wide py-20 md:py-32">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Sparkles className="h-3.5 w-3.5" /> AI-drevet matching i hele Europa
          </span>
        </motion.div>
        <motion.h1 initial="hidden" animate="visible" custom={1} variants={fadeUp} className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Find den perfekte <span className="text-gradient">fagperson</span> til din opgave
        </motion.h1>
        <motion.p initial="hidden" animate="visible" custom={2} variants={fadeUp} className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
          HomeHero matcher dig med verificerede, lokale fagfolk. Fair priser, gennemsigtig betaling og AI-drevet kvalitetssikring.
        </motion.p>
        <motion.div initial="hidden" animate="visible" custom={3} variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/customer/register">
            <Button size="lg" className="w-full sm:w-auto gap-2 h-12 px-8 text-base">
              Find en fagperson <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/provider/register">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-base">
              Bliv provider
            </Button>
          </Link>
        </motion.div>
        <motion.div initial="hidden" animate="visible" custom={4} variants={fadeUp} className="flex items-center justify-center gap-6 mt-10 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-primary" /> Verificerede fagfolk</span>
          <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-accent" /> AI prisforslag</span>
          <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-warning" /> 4.9 gennemsnit</span>
        </motion.div>
      </div>
    </div>
  </section>
);

const CategoriesSection = () => (
  <section className="section-padding bg-secondary/30">
    <div className="container-wide">
      <div className="text-center mb-12">
        <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">Alle typer hjemmeservice</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">Fra rengøring til flytning — vi dækker hele spektret med kvalificerede fagfolk i dit nærområde.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {serviceCategories.map((cat, i) => (
          <motion.div key={cat.id} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp}>
            <Link to={`/services/${cat.id}`} className="group block glass-card p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <span className="text-4xl mb-4 block">{cat.icon}</span>
              <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{cat.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{cat.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.subcategories.slice(0, 3).map((sub) => (
                  <span key={sub} className="text-xs bg-secondary rounded-full px-2.5 py-0.5 text-muted-foreground">{sub}</span>
                ))}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const HowItWorksSection = () => {
  const steps = [
    { icon: <Search className="h-6 w-6" />, title: "Beskriv din opgave", desc: "Fortæl os hvad du har brug for, og vores AI finder de bedste fagfolk." },
    { icon: <Sparkles className="h-6 w-6" />, title: "Modtag AI-tilbud", desc: "Få dynamiske tilbud baseret på markedspriser — ingen budkrig, fair priser." },
    { icon: <CheckCircle2 className="h-6 w-6" />, title: "Vælg og book", desc: "Gennemgå profiler, ratings og priser. Book direkte med sikker betaling." },
  ];
  return (
    <section className="section-padding">
      <div className="container-wide">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">Sådan virker det</h2>
          <p className="text-muted-foreground">Tre simple skridt til en løst opgave</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i} variants={fadeUp} className="text-center">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-primary-foreground mx-auto mb-5">
                {step.icon}
              </div>
              <div className="text-xs font-bold text-primary mb-2">TRIN {i + 1}</div>
              <h3 className="font-heading font-semibold text-xl mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const TrustSection = () => (
  <section className="section-padding bg-secondary/30">
    <div className="container-wide">
      <div className="glass-card p-8 md:p-12 text-center">
        <h2 className="font-heading text-2xl md:text-3xl font-bold mb-4">Fair priser i hele Europa</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
          Vi bruger AI til at sikre fair priser baseret på lokale overenskomster og markedspriser. 
          Ingen underbetaling — alle providere betales mindst efter gældende satser i deres land.
        </p>
        <div className="grid sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <div className="p-4">
            <div className="text-3xl font-heading font-bold text-primary">12+</div>
            <div className="text-sm text-muted-foreground mt-1">Europæiske lande</div>
          </div>
          <div className="p-4">
            <div className="text-3xl font-heading font-bold text-primary">25%</div>
            <div className="text-sm text-muted-foreground mt-1">Platformgebyr (delt)</div>
          </div>
          <div className="p-4">
            <div className="text-3xl font-heading font-bold text-primary">0</div>
            <div className="text-sm text-muted-foreground mt-1">Budkrig</div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const CTASection = () => (
  <section className="section-padding">
    <div className="container-wide">
      <div className="gradient-hero rounded-3xl p-8 md:p-16 text-center">
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
          Klar til at komme i gang?
        </h2>
        <p className="text-primary-foreground/80 max-w-lg mx-auto mb-8">
          Opret din gratis profil på under 2 minutter. Uanset om du søger hjælp eller vil tilbyde dine services.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/customer/register">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto h-12 px-8">
              Jeg søger hjælp
            </Button>
          </Link>
          <Link to="/provider/register">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
              Jeg tilbyder hjælp
            </Button>
          </Link>
        </div>
      </div>
    </div>
  </section>
);

const Index = () => (
  <div>
    <HeroSection />
    <CategoriesSection />
    <HowItWorksSection />
    <TrustSection />
    <CTASection />
  </div>
);

export default Index;
