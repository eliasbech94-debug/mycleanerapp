import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Star, MapPin, Shield, CheckCircle2, Clock, MessageSquare, Heart, Share2,
  Calendar, Award, Sparkles, TrendingUp, Briefcase, Zap, BadgeCheck,
  Timer, FileCheck, ThumbsUp, Wallet, Wrench, UserCheck, XCircle,
  ShieldCheck, Umbrella, HardHat, GraduationCap, Leaf, FileBadge, ScrollText,
} from "lucide-react";

const CERT_ICONS: { match: RegExp; Icon: typeof Shield; tone: string }[] = [
  { match: /id[- ]?verifi/i,         Icon: BadgeCheck,     tone: "from-primary/20 to-primary/5 text-primary" },
  { match: /straffeattest/i,         Icon: ShieldCheck,    tone: "from-success/20 to-success/5 text-success" },
  { match: /forsikr/i,               Icon: Umbrella,       tone: "from-info/20 to-info/5 text-info" },
  { match: /iso/i,                   Icon: Award,          tone: "from-accent/20 to-accent/5 text-accent" },
  { match: /arbejdsmilj/i,           Icon: HardHat,        tone: "from-warning/20 to-warning/5 text-warning" },
  { match: /svendebrev|uddann/i,     Icon: GraduationCap,  tone: "from-primary/20 to-primary/5 text-primary" },
  { match: /milj|grøn|øko/i,         Icon: Leaf,           tone: "from-success/20 to-success/5 text-success" },
  { match: /certifik|licens/i,       Icon: FileBadge,      tone: "from-info/20 to-info/5 text-info" },
  { match: /kontrakt|aftale/i,       Icon: ScrollText,     tone: "from-muted-foreground/20 to-muted/5 text-foreground" },
];
const certVisual = (label: string) =>
  CERT_ICONS.find((c) => c.match.test(label)) ?? { Icon: CheckCircle2, tone: "from-primary/20 to-primary/5 text-primary" };
import Tilt from "@/components/Tilt";
import { serviceCategories, formatPrice } from "@/lib/countries";
import { getProvider, getCountry, deriveServices, deriveHourlyRate } from "@/lib/providers";

const reviews = [
  { name: "Sofie L.", rating: 5, time: "2 dage siden", text: "Mikkel var super professionel og hurtig. Samlede vores nye køkken på 4 timer. Helt fast pris og rent efter sig. Anbefales!", job: "Møbelsamling" },
  { name: "Anders P.", rating: 5, time: "1 uge siden", text: "Top kvalitet. Malede stuen og gangen i weekenden. Kom til tiden, ryddede op og prisen var som aftalt.", job: "Malerarbejde" },
  { name: "Camilla H.", rating: 4, time: "3 uger siden", text: "God service og fair pris. Tog lidt længere end estimeret, men resultatet var fint.", job: "Gulvlægning" },
];

const ProviderProfile = () => {
  const { id } = useParams();
  const [saved, setSaved] = useState(false);
  const [certLoading, setCertLoading] = useState(true);
  const provider = getProvider(id || "p_001") || getProvider("p_001")!;
  const country = getCountry(provider.countryCode);
  const services = useMemo(
    () => deriveServices(provider.categories, provider.subcategories, country),
    [provider.categories, provider.subcategories, country],
  );
  const hourlyRate = provider.hourlyRate ?? deriveHourlyRate(country);

  useEffect(() => {
    const t = setTimeout(() => setCertLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

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
                { icon: Zap, label: "Timepris fra", value: formatPrice(hourlyRate, country) },
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

              <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
                <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
                <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2 relative">
                  <span className="relative inline-flex items-center justify-center h-8 w-8 rounded-xl gradient-hero text-primary-foreground shadow-lg">
                    <Shield className="h-4 w-4" />
                    <Sparkles className="cert-sparkle absolute -top-1.5 -right-1.5 h-3 w-3 text-accent" />
                  </span>
                  Verificering & certificeringer
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 relative">
                  {certLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="cert-skeleton-ring cert-skeleton rounded-2xl border border-border/40 p-3 flex flex-col items-center text-center gap-2"
                          style={{ animationDelay: `${i * 0.12}s` }}
                        >
                          <div className="rounded-xl bg-muted/60 p-2.5 shadow-sm h-10 w-10" />
                          <div className="h-3 w-20 bg-muted/50 rounded" />
                          <div className="h-2.5 w-14 bg-muted/40 rounded" />
                        </div>
                      ))
                    : provider.certifications.map((c, i) => {
                        const { Icon, tone } = certVisual(c);
                        return (
                          <div
                            key={c}
                            className={`cert-tile group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${tone} p-3 flex flex-col items-center text-center gap-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 animate-fade-in`}
                            style={{ animationDelay: `${i * 0.08}s` }}
                          >
                            <div
                              className="floaty relative rounded-xl bg-background/80 backdrop-blur-sm p-2.5 ring-1 ring-border/60 shadow-sm group-hover:ring-primary/40 group-hover:shadow-primary/20 transition-all"
                              style={{ animationDelay: `${(i % 4) * 0.6}s`, animationDuration: `${6 + (i % 3)}s` }}
                            >
                              <Icon className="h-5 w-5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6" strokeWidth={2.2} />
                              <Sparkles
                                className="cert-sparkle absolute -top-1 -right-1 h-3 w-3 text-accent opacity-0 group-hover:opacity-100"
                                style={{ animationDelay: `${i * 0.15}s` }}
                              />
                            </div>
                            <span className="text-[11px] sm:text-xs font-medium leading-tight text-foreground/90 line-clamp-2 relative z-10">
                              {c}
                            </span>
                            <span className="badge-pulse absolute top-1.5 right-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-success text-success-foreground">
                              <CheckCircle2 className="h-3 w-3" strokeWidth={3} />
                            </span>
                          </div>
                        );
                      })}
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

            <TabsContent value="services" className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-semibold">Ydelser & priser</h2>
                  <p className="text-xs text-muted-foreground">
                    Priser i {country.currency} · inkl. moms ({Math.round(country.vatRate * 100)}%) · {country.laborAgreement}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" /> Min. {formatPrice(country.minHourlyRate, country)}/t
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {provider.categories.map((catId) => {
                  const cat = serviceCategories.find((c) => c.id === catId);
                  if (!cat) return null;
                  const catServices = services.filter((s) => s.categoryId === catId);
                  return (
                    <Tilt key={catId} className="glass-card p-5 rounded-2xl flex flex-col" max={5}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="text-3xl">{cat.icon}</div>
                        <div>
                          <h3 className="font-heading font-semibold leading-tight">{cat.name}</h3>
                          <p className="text-xs text-muted-foreground">{catServices.length} ydelser</p>
                        </div>
                      </div>

                      <ul className="space-y-3 flex-1">
                        {catServices.map((s) => {
                          const unitLabel = s.unit === "hour" ? "/t" : s.unit === "m2" ? "/m²" : "";
                          return (
                            <li
                              key={s.subcategory}
                              className="p-3 rounded-xl bg-secondary/40 border border-border/50 hover:border-primary/40 transition-colors"
                              data-cursor="hover"
                            >
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <div className="font-medium text-sm">{s.subcategory}</div>
                                <div className="text-right flex-shrink-0">
                                  <div className="font-heading font-semibold text-sm whitespace-nowrap">
                                    {formatPrice(s.price, country)}
                                    <span className="text-xs text-muted-foreground font-normal">{unitLabel}</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    fra {formatPrice(s.minPrice, country)}
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground leading-snug">{s.description}</p>
                            </li>
                          );
                        })}
                      </ul>

                      <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                        <Link to="/task/create">
                          <Zap className="h-3.5 w-3.5 mr-1.5" /> Få AI-prisestimat
                        </Link>
                      </Button>
                    </Tilt>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-center px-4">
                Endelige priser tilpasses opgavens omfang. Ingen budkrig — alle priser ligger på markedsniveau i {country.name}.
              </p>
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

              {(() => {
                const base = provider.rating;
                const clamp = (n: number) => Math.max(3.5, Math.min(5, Math.round(n * 10) / 10));
                const cancellation = Math.max(0, Math.min(8, Math.round((5 - base) * 4 * 10) / 10));
                const categories = [
                  { icon: ThumbsUp, label: "Helhedsindtryk", value: clamp(base), hint: "Samlet oplevelse af samarbejdet" },
                  { icon: Timer, label: "Svartid", value: clamp(base + 0.05), hint: `Svarer typisk ${provider.responseTime}` },
                  { icon: FileCheck, label: "Korrekt profilinfo", value: clamp(base - 0.05), hint: "Profilens oplysninger stemmer med virkeligheden" },
                  { icon: CheckCircle2, label: "Udført uden anmærkninger", value: clamp(base - 0.1), hint: "Opgaver afsluttet uden klager" },
                  { icon: Wallet, label: "Aftalt pris & tid", value: clamp(base - 0.02), hint: "Holder den aftalte pris og tidsplan" },
                  { icon: Wrench, label: "Kvalitet", value: clamp(base + 0.02), hint: "Håndværksmæssig udførelse" },
                  { icon: UserCheck, label: "Faglighed", value: clamp(base), hint: "Professionel adfærd og kompetence" },
                ];
                const avgScore = categories.reduce((s, c) => s + c.value, 0) / categories.length;
                const cancellationPenalty = cancellation * 0.06;
                const totalScore = Math.max(3.0, Math.min(5, Math.round((avgScore - cancellationPenalty) * 10) / 10));
                const totalPct = (totalScore / 5) * 100;
                return (
                  <div className="glass-card p-6 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-heading text-lg font-semibold">Vurdering af profilen</h3>
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" /> Verificerede anmeldelser
                      </Badge>
                    </div>

                    {/* Samlet score */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 mb-5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="text-center sm:text-left">
                          <div className="font-heading text-5xl font-bold text-primary">{totalScore.toFixed(1)}</div>
                          <div className="flex items-center gap-0.5 justify-center sm:justify-start mt-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`h-4 w-4 ${i < Math.round(totalScore) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Samlet score ud af 5</div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Baseret på {provider.reviews} anmeldelser</span>
                            <span className="font-semibold tabular-nums">{totalPct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full gradient-hero" style={{ width: `${totalPct}%` }} />
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug mt-2">
                            Vægtet gennemsnit af alle kriterier. Annulleringsrate på {cancellation.toFixed(1)}% trækker {cancellationPenalty.toFixed(2)} fra samlet score.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      {categories.map((c) => {
                        const pct = (c.value / 5) * 100;
                        return (
                          <div key={c.label} className="p-3 rounded-xl bg-secondary/40 border border-border/50">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <c.icon className="h-4 w-4 text-primary flex-shrink-0" />
                                <span className="text-sm font-medium truncate">{c.label}</span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                <span className="text-sm font-semibold tabular-nums">{c.value.toFixed(1)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                              <div className="h-full gradient-hero" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">{c.hint}</p>
                          </div>
                        );
                      })}
                      <div className="p-3 rounded-xl bg-secondary/40 border border-border/50 sm:col-span-2">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                            <span className="text-sm font-medium truncate">Annulleringsrate</span>
                          </div>
                          <span className={`text-sm font-semibold tabular-nums ${cancellation <= 2 ? "text-success" : cancellation <= 5 ? "text-warning" : "text-destructive"}`}>
                            {cancellation.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                          <div
                            className={`h-full ${cancellation <= 2 ? "bg-success" : cancellation <= 5 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${Math.min(100, cancellation * 10)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Andel af accepterede opgaver der efterfølgende blev annulleret af udbyderen. Lavere er bedre.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
