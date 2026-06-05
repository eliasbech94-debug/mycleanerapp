import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Star, MapPin, Shield, CheckCircle2, Clock, MessageSquare, Heart, Share2,
  Calendar, Award, Sparkles, TrendingUp, Briefcase, Zap, BadgeCheck,
} from "lucide-react";
import Tilt from "@/components/Tilt";
import { countries, serviceCategories, formatPrice } from "@/lib/countries";

const provider = {
  id: "p_001",
  name: "Mikkel Sørensen",
  handle: "@mikkel.fix",
  tagline: "Tømrer & altmuligmand · 12 års erfaring",
  bio: "Specialiseret i renovering, møbelmontering og småreparationer. Punktlig, ren arbejdsgang og altid fast pris før jeg starter. Arbejder primært i Storkøbenhavn.",
  type: "business" as "private" | "business",
  verified: true,
  topRated: true,
  rating: 4.92,
  reviews: 184,
  jobsCompleted: 312,
  responseTime: "< 1 t",
  repeatClients: 68,
  city: "København",
  countryCode: "DK",
  radiusKm: 25,
  memberSince: "2022",
  languages: ["Dansk", "English", "Deutsch"],
  categories: ["handyman", "moving"],
  subcategories: ["Møbelsamling", "Malerarbejde", "Gulvlægning", "Boligflytning"],
  hourlyRate: 425,
  avatar: "",
  gallery: [
    "from-primary/30 to-accent/30",
    "from-accent/30 to-info/30",
    "from-info/30 to-primary/30",
    "from-success/30 to-primary/30",
    "from-primary/20 to-accent/40",
    "from-accent/40 to-success/30",
  ],
  certifications: ["Tømrer svendebrev", "Forsikret hos Tryg", "ID-verificeret", "Straffeattest godkendt"],
};

const reviews = [
  { name: "Sofie L.", rating: 5, time: "2 dage siden", text: "Mikkel var super professionel og hurtig. Samlede vores nye køkken på 4 timer. Helt fast pris og rent efter sig. Anbefales!", job: "Møbelsamling" },
  { name: "Anders P.", rating: 5, time: "1 uge siden", text: "Top kvalitet. Malede stuen og gangen i weekenden. Kom til tiden, ryddede op og prisen var som aftalt.", job: "Malerarbejde" },
  { name: "Camilla H.", rating: 4, time: "3 uger siden", text: "God service og fair pris. Tog lidt længere end estimeret, men resultatet var fint.", job: "Gulvlægning" },
];

const ProviderProfile = () => {
  useParams();
  const [saved, setSaved] = useState(false);
  const country = countries.find((c) => c.code === provider.countryCode) || countries[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Cover / hero */}
      <div className="relative h-48 sm:h-64 overflow-hidden">
        <div className="absolute inset-0 mesh-blob opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
        <div className="absolute inset-0 noise" />
      </div>

      <div className="container-narrow -mt-20 sm:-mt-24 relative z-10 pb-16">
        <div className="max-w-5xl mx-auto">
          {/* Header card */}
          <Tilt className="glass-card p-5 sm:p-8 rounded-3xl" max={4}>
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 sm:items-end">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 ring-4 ring-background shadow-xl">
                <AvatarImage src={provider.avatar} alt={provider.name} />
                <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-heading">
                  {provider.name.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h1 className="font-heading text-2xl sm:text-3xl font-bold truncate">{provider.name}</h1>
                  {provider.verified && (
                    <BadgeCheck className="h-6 w-6 text-primary flex-shrink-0" aria-label="Verificeret" />
                  )}
                  {provider.topRated && (
                    <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground border-0">
                      <Sparkles className="h-3 w-3 mr-1" /> Top Rated
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{provider.tagline}</p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm">
                  <span className="flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {provider.rating} <span className="text-muted-foreground font-normal">({provider.reviews})</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-4 w-4" /> {provider.city} · {provider.radiusKm} km
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" /> Svarer {provider.responseTime}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 sm:flex-col sm:items-end">
                <Button size="icon" variant="outline" onClick={() => setSaved((s) => !s)} aria-label="Gem">
                  <Heart className={`h-4 w-4 ${saved ? "fill-destructive text-destructive" : ""}`} />
                </Button>
                <Button size="icon" variant="outline" aria-label="Del">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border">
              {[
                { icon: Briefcase, label: "Opgaver", value: provider.jobsCompleted },
                { icon: TrendingUp, label: "Genbestilling", value: `${provider.repeatClients}%` },
                { icon: Award, label: "Medlem siden", value: provider.memberSince },
                { icon: Zap, label: "Timepris fra", value: formatPrice(provider.hourlyRate, country) },
              ].map((s) => (
                <div key={s.label} className="text-center sm:text-left">
                  <s.icon className="h-4 w-4 text-primary mb-1 mx-auto sm:mx-0" />
                  <div className="font-heading font-semibold text-lg leading-tight">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Button asChild className="flex-1" size="lg">
                <Link to="/task/create">
                  <Calendar className="h-4 w-4 mr-2" /> Anmod om tilbud
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="flex-1">
                <MessageSquare className="h-4 w-4 mr-2" /> Send besked
              </Button>
            </div>
          </Tilt>

          {/* Tabs */}
          <Tabs defaultValue="about" className="mt-8">
            <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
              <TabsTrigger value="about">Om</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
              <TabsTrigger value="reviews">Anmeldelser</TabsTrigger>
            </TabsList>

            <TabsContent value="about" className="mt-6 space-y-6">
              <div className="glass-card p-6 rounded-2xl">
                <h2 className="font-heading text-lg font-semibold mb-3">Om {provider.name.split(" ")[0]}</h2>
                <p className="text-muted-foreground leading-relaxed">{provider.bio}</p>
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Sprog</div>
                    <div className="flex flex-wrap gap-1.5">
                      {provider.languages.map((l) => (
                        <Badge key={l} variant="secondary">{l}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Type</div>
                    <Badge variant="outline" className="capitalize">
                      {provider.type === "business" ? "Virksomhed" : "Privat udbyder"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl">
                <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" /> Verificering & certificeringer
                </h3>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {provider.certifications.map((c) => (
                    <div key={c} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-info/10 border border-info/20 text-sm">
                <p className="font-medium text-info mb-1">Fair pris-garanti</p>
                <p className="text-muted-foreground">
                  Alle priser ligger på eller omkring markedspris i {country.name} ({country.laborAgreement}).
                  Ingen budkrig — ingen underbetaling. Min. {country.currencySymbol}{country.minHourlyRate}/t.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="services" className="mt-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {provider.categories.map((catId) => {
                  const cat = serviceCategories.find((c) => c.id === catId);
                  if (!cat) return null;
                  return (
                    <Tilt key={catId} className="glass-card p-5 rounded-2xl" max={6}>
                      <div className="text-3xl mb-2">{cat.icon}</div>
                      <h3 className="font-heading font-semibold mb-1">{cat.name}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{cat.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.subcategories
                          .filter((s) => provider.subcategories.includes(s))
                          .map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                      </div>
                    </Tilt>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="portfolio" className="mt-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {provider.gallery.map((g, i) => (
                  <div
                    key={i}
                    data-cursor="hover"
                    className={`aspect-square rounded-2xl bg-gradient-to-br ${g} relative overflow-hidden group cursor-pointer`}
                  >
                    <div className="absolute inset-0 noise opacity-50" />
                    <div className="absolute inset-0 bg-background/0 group-hover:bg-background/20 transition-colors" />
                    <div className="absolute bottom-2 left-2 right-2 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Projekt #{i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="reviews" className="mt-6 space-y-4">
              <div className="glass-card p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="text-center sm:text-left">
                  <div className="font-heading text-5xl font-bold">{provider.rating}</div>
                  <div className="flex items-center gap-0.5 justify-center sm:justify-start mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{provider.reviews} anmeldelser</div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const pct = star === 5 ? 86 : star === 4 ? 11 : star === 3 ? 2 : 1;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-3 text-muted-foreground">{star}</span>
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full gradient-hero" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-muted-foreground text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {reviews.map((r, i) => (
                <div key={i} className="glass-card p-5 rounded-2xl">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-secondary text-sm">{r.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.time} · {r.job}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: r.rating }).map((_, idx) => (
                        <Star key={idx} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ProviderProfile;
