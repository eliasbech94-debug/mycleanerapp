import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Building2, User, Upload, Shield, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { countries, serviceCategories, formatPrice } from "@/lib/countries";
import { deriveServices, deriveHourlyRate, saveProvider } from "@/lib/providers";

const steps = ["Type", "Personlig info", "Services & område", "Dokumenter", "Gennemse"];

const ProviderRegister = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    type: "private" as "private" | "business",
    firstName: "", lastName: "", email: "", phone: "",
    companyName: "", cvr: "",
    country: "DK",
    city: "", postalCode: "",
    categories: [] as string[],
    subcategories: [] as string[],
    radius: "25",
    bio: "",
    acceptTerms: false,
  });

  const update = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));
  const toggleCategory = (id: string) => {
    setForm((p) => {
      const has = p.categories.includes(id);
      const cat = serviceCategories.find((c) => c.id === id);
      const subs = cat?.subcategories ?? [];
      return {
        ...p,
        categories: has ? p.categories.filter((c) => c !== id) : [...p.categories, id],
        // auto-select all subcategories when category is added; remove on toggle off
        subcategories: has
          ? p.subcategories.filter((s) => !subs.includes(s))
          : [...new Set([...p.subcategories, ...subs])],
      };
    });
  };
  const toggleSubcategory = (sub: string) => {
    setForm((p) => ({
      ...p,
      subcategories: p.subcategories.includes(sub)
        ? p.subcategories.filter((s) => s !== sub)
        : [...p.subcategories, sub],
    }));
  };
  const country = countries.find((c) => c.code === form.country) || countries[0];
  const derivedServices = useMemo(
    () => deriveServices(form.categories, form.subcategories, country),
    [form.categories, form.subcategories, country],
  );
  const derivedHourly = useMemo(() => deriveHourlyRate(country), [country]);

  // Validate: every service's effective hourly rate must meet the country's labor agreement floor
  const priceViolations = useMemo(() => {
    const floor = country.minHourlyRate;
    return derivedServices
      .map((s) => {
        const effectiveHourly = Math.round(s.minPrice / Math.max(1, s.minJobHours));
        const underlyingHourly = Math.round(country.minHourlyRate * s.rateMultiplier);
        const violatesUnderlying = underlyingHourly < floor;
        const violatesMinJob = effectiveHourly < floor;
        if (!violatesUnderlying && !violatesMinJob) return null;
        return { service: s, effectiveHourly, underlyingHourly };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [derivedServices, country]);
  const hasPriceViolations = priceViolations.length > 0;
  const violationSubs = useMemo(
    () => new Set(priceViolations.map((v) => v.service.subcategory)),
    [priceViolations],
  );

  // Real-time toast feedback when validation state changes (country / category / sub edits)
  const prevViolationCount = useRef<number | null>(null);
  const prevCountry = useRef<string>(form.country);
  useEffect(() => {
    const prev = prevViolationCount.current;
    const count = priceViolations.length;
    const countryChanged = prevCountry.current !== form.country;
    if (prev === null) {
      prevViolationCount.current = count;
      prevCountry.current = form.country;
      return;
    }
    if (countryChanged) {
      toast(`${country.flag} ${country.name} valgt`, {
        description: `Min. timepris ${formatPrice(country.minHourlyRate, country)} · ${country.laborAgreement}`,
      });
    }
    if (count > prev) {
      toast.error("Ydelse under min. timepris", {
        description: `${count} ydelse(r) overholder ikke ${country.laborAgreement}.`,
      });
    } else if (count === 0 && prev > 0) {
      toast.success("Alle priser overholder overenskomsten", {
        description: `${derivedServices.length} ydelse(r) godkendt for ${country.name}.`,
      });
    }
    prevViolationCount.current = count;
    prevCountry.current = form.country;
  }, [priceViolations.length, form.country, country, derivedServices.length]);

  const handleSubmit = () => {
    if (hasPriceViolations) {
      toast.error("Priser under overenskomstgrænsen", {
        description: `${priceViolations.length} ydelse(r) ligger under ${country.laborAgreement}. Juster før indsendelse.`,
      });
      return;
    }
    const id = `p_${Date.now()}`;
    const name = form.type === "business" && form.companyName
      ? form.companyName
      : `${form.firstName} ${form.lastName}`.trim() || "Ny provider";
    saveProvider({
      id,
      name,
      handle: `@${(form.firstName || "ny").toLowerCase()}`,
      tagline: form.bio || `${form.type === "business" ? "Virksomhed" : "Privat udbyder"} i ${form.city || country.name}`,
      bio: form.bio || "",
      type: form.type,
      verified: false,
      topRated: false,
      rating: 0,
      reviews: 0,
      jobsCompleted: 0,
      responseTime: "—",
      repeatClients: 0,
      city: form.city || country.name,
      countryCode: form.country,
      radiusKm: parseInt(form.radius, 10) || 25,
      memberSince: String(new Date().getFullYear()),
      languages: ["Dansk"],
      categories: form.categories,
      subcategories: form.subcategories,
      avatar: "",
      gallery: [
        "from-primary/30 to-accent/30",
        "from-accent/30 to-info/30",
        "from-info/30 to-primary/30",
      ],
      certifications: form.type === "business" ? ["CVR registreret"] : ["ID-verificeret"],
    });
    navigate(`/provider/${id}`);
  };


  return (
    <div className="min-h-screen bg-background">
      <div className="container-narrow py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-heading text-3xl font-bold mb-2">Bliv HomeHero provider</h1>
            <p className="text-muted-foreground">Tilmeld dig og start med at tage opgaver i dit område</p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-1 mb-10">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-all ${i <= step ? "gradient-hero" : "bg-border"}`} />
                <p className={`text-xs mt-1.5 ${i === step ? "text-primary font-medium" : "text-muted-foreground"}`}>{s}</p>
              </div>
            ))}
          </div>

          <div className="glass-card p-6 md:p-8">
            {step === 0 && (
              <div className="space-y-6">
                <h2 className="font-heading text-xl font-semibold">Vælg din providertype</h2>
                <RadioGroup value={form.type} onValueChange={(v) => update("type", v)} className="grid sm:grid-cols-2 gap-4">
                  <Label htmlFor="private" className="cursor-pointer">
                    <div className={`border-2 rounded-2xl p-6 transition-all ${form.type === "private" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <RadioGroupItem value="private" id="private" className="sr-only" />
                      <User className="h-8 w-8 text-primary mb-3" />
                      <div className="font-heading font-semibold mb-1">Privat udbyder</div>
                      <p className="text-sm text-muted-foreground">Gratis oprettelse. Perfekt til freelancere og enkeltmandsvirksomheder.</p>
                    </div>
                  </Label>
                  <Label htmlFor="business" className="cursor-pointer">
                    <div className={`border-2 rounded-2xl p-6 transition-all ${form.type === "business" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <RadioGroupItem value="business" id="business" className="sr-only" />
                      <Building2 className="h-8 w-8 text-primary mb-3" />
                      <div className="font-heading font-semibold mb-1">Virksomhed</div>
                      <p className="text-sm text-muted-foreground">Oprettelsesgebyr + kvartalsvis abonnement. Flere medarbejdere og områder.</p>
                      <div className="mt-2 text-xs text-accent font-medium">Fra {country.currencySymbol}499/kvartal</div>
                    </div>
                  </Label>
                </RadioGroup>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <h2 className="font-heading text-xl font-semibold">Dine oplysninger</h2>
                {form.type === "business" && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><Label>Virksomhedsnavn</Label><Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="Firma ApS" /></div>
                    <div><Label>CVR / Org.nr</Label><Input value={form.cvr} onChange={(e) => update("cvr", e.target.value)} placeholder="12345678" /></div>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>Fornavn</Label><Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} /></div>
                  <div><Label>Efternavn</Label><Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
                <div><Label>Telefon</Label><Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
                <div>
                  <Label>Land</Label>
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="font-heading text-xl font-semibold">Dine services & dækningsområde</h2>
                <div>
                  <Label className="mb-3 block">Hvilke services tilbyder du?</Label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {serviceCategories.map((cat) => (
                      <label key={cat.id} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${form.categories.includes(cat.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        <Checkbox checked={form.categories.includes(cat.id)} onCheckedChange={() => toggleCategory(cat.id)} />
                        <div>
                          <div className="font-medium text-sm">{cat.icon} {cat.name}</div>
                          <div className="text-xs text-muted-foreground">{cat.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {form.categories.length > 0 && (
                  <div>
                    <Label className="mb-3 block">Vælg specifikke ydelser</Label>
                    <div className="space-y-3">
                      {form.categories.map((catId) => {
                        const cat = serviceCategories.find((c) => c.id === catId);
                        if (!cat) return null;
                        return (
                          <div key={catId} className="p-3 rounded-xl bg-secondary/40 border border-border/50">
                            <div className="text-xs font-medium text-muted-foreground mb-2">{cat.icon} {cat.name}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {cat.subcategories.map((sub) => {
                                const active = form.subcategories.includes(sub);
                                return (
                                  <button
                                    type="button"
                                    key={sub}
                                    onClick={() => toggleSubcategory(sub)}
                                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}
                                  >
                                    {sub}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>By</Label><Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="København" /></div>
                  <div><Label>Postnummer</Label><Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} placeholder="2100" /></div>
                </div>
                <div>
                  <Label>Dækningsradius</Label>
                  <Select value={form.radius} onValueChange={(v) => update("radius", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 km</SelectItem>
                      <SelectItem value="25">25 km</SelectItem>
                      <SelectItem value="50">50 km</SelectItem>
                      <SelectItem value="100">100 km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-sm">
                  <p className="font-medium text-info flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> AI prisforslag · {country.flag} {country.name}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Min. timepris: <strong>{formatPrice(country.minHourlyRate, country)}</strong> ({country.laborAgreement}).
                    Foreslået timepris: <strong>{formatPrice(derivedHourly, country)}</strong>.
                  </p>
                  {derivedServices.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {derivedServices.slice(0, 6).map((s) => {
                        const unit = s.unit === "hour" ? "/t" : s.unit === "m2" ? "/m²" : "";
                        return (
                          <div key={s.subcategory} className="flex items-center justify-between gap-2 text-xs bg-background/60 rounded-lg px-2.5 py-1.5">
                            <span className="truncate">{s.subcategory}</span>
                            <span className="font-semibold whitespace-nowrap">{formatPrice(s.price, country)}<span className="text-muted-foreground font-normal">{unit}</span></span>
                          </div>
                        );
                      })}
                      {derivedServices.length > 6 && (
                        <div className="text-xs text-muted-foreground sm:col-span-2">
                          +{derivedServices.length - 6} flere ydelser auto-prissat
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}


            {step === 3 && (
              <div className="space-y-6">
                <h2 className="font-heading text-xl font-semibold">Upload dokumenter</h2>
                <p className="text-sm text-muted-foreground">For at blive godkendt skal vi verificere din identitet og evt. kvalifikationer.</p>
                <div className="space-y-4">
                  {["Billedlegitimation (pas/kørekort)", "Straffeattest", "Erhvervsbevis / certificeringer"].map((doc) => (
                    <div key={doc} className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/30 transition-colors cursor-pointer">
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">{doc}</p>
                      <p className="text-xs text-muted-foreground mt-1">Klik for at uploade (PDF, JPG, PNG)</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Dine data er sikre</p>
                    <p className="text-muted-foreground">Dokumenter krypteres og opbevares sikkert. Kun brugt til verificering.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <h2 className="font-heading text-xl font-semibold">Gennemse din ansøgning</h2>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-secondary">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Providertype</div>
                    <div className="font-medium">{form.type === "private" ? "Privat udbyder" : "Virksomhed"}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Personlig info</div>
                    <div className="font-medium">{form.firstName} {form.lastName}</div>
                    <div className="text-sm text-muted-foreground">{form.email} • {form.phone}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Services & område</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {form.categories.map((id) => {
                        const cat = serviceCategories.find((c) => c.id === id);
                        return <span key={id} className="bg-primary/10 text-primary text-xs px-2.5 py-0.5 rounded-full">{cat?.icon} {cat?.name}</span>;
                      })}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">{form.city} {form.postalCode} • {form.radius} km radius</div>
                  </div>

                  {/* Step-by-step price overview */}
                  <div className="p-4 rounded-xl bg-secondary">
                    <div className="flex items-center justify-between mb-3 gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Pris-oversigt</div>
                        <div className="font-medium flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-primary" /> Auto-beregnet for {country.flag} {country.name}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Foreslået timepris</div>
                        <div className="font-heading font-bold text-primary">{formatPrice(derivedHourly, country)}</div>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground mb-3">
                      Min. timepris: <strong className="text-foreground">{formatPrice(country.minHourlyRate, country)}</strong> · {country.laborAgreement}
                    </div>

                    {hasPriceViolations && (
                      <div className="mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs">
                        <div className="flex items-center gap-1.5 font-medium text-destructive mb-1.5">
                          <AlertTriangle className="h-4 w-4" /> Pris under overenskomstgrænsen
                        </div>
                        <p className="text-muted-foreground mb-2">
                          {priceViolations.length} ydelse(r) ligger under den lovpligtige min. timepris ({formatPrice(country.minHourlyRate, country)}) i {country.name}. Du kan ikke indsende profilen før det er rettet.
                        </p>
                        <ul className="space-y-1">
                          {priceViolations.map((v) => (
                            <li key={v.service.subcategory} className="flex items-center justify-between gap-2 bg-background/60 rounded px-2 py-1">
                              <span className="truncate">{v.service.subcategory}</span>
                              <span className="text-destructive whitespace-nowrap font-medium">
                                {formatPrice(v.effectiveHourly, country)}/t
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}


                    {derivedServices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Vælg mindst én ydelse i trin 3 for at se priser.</p>
                    ) : (
                      <div className="space-y-3">
                        {form.categories.map((catId) => {
                          const cat = serviceCategories.find((c) => c.id === catId);
                          const items = derivedServices.filter((s) => s.categoryId === catId);
                          if (!cat || items.length === 0) return null;
                          return (
                            <div key={catId} className="rounded-lg bg-background/60 border border-border/50 overflow-hidden">
                              <div className="px-3 py-2 text-xs font-medium flex items-center justify-between bg-secondary/60">
                                <span>{cat.icon} {cat.name}</span>
                                <span className="text-muted-foreground">{items.length} ydelser</span>
                              </div>
                              <div className="divide-y divide-border/50">
                                {items.map((s) => {
                                  const unitLabel = s.unit === "hour" ? "/t" : s.unit === "m2" ? "/m²" : " / opgave";
                                  const unitName = s.unit === "hour" ? "pr. time" : s.unit === "m2" ? "pr. m²" : "pr. opgave";
                                  return (
                                    <div key={s.subcategory} className="px-3 py-2.5 text-sm">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium truncate">{s.subcategory}</div>
                                          <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="font-semibold whitespace-nowrap">
                                            {formatPrice(s.price, country)}
                                            <span className="text-muted-foreground font-normal text-xs">{unitLabel}</span>
                                          </div>
                                          <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                            min. {formatPrice(s.minPrice, country)}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-2 rounded-md bg-secondary/50 border border-border/40 px-2 py-1.5 text-[11px] text-muted-foreground leading-relaxed">
                                        <span className="font-medium text-foreground">Beregning:</span>{" "}
                                        {country.flag} {country.name} · {cat.name} · {unitName}
                                        <br />
                                        {formatPrice(country.minHourlyRate, country)} (min. timepris)
                                        {" × "}{s.rateMultiplier}× (kategori-sats)
                                        {" × "}{s.minJobHours} {s.minJobHours === 1 ? "time" : "timer"} (min. opgave)
                                        {" = "}
                                        <strong className="text-foreground">{formatPrice(s.minPrice, country)}</strong>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t border-border/50">
                          <span>Total ydelser</span>
                          <span className="font-medium text-foreground">{derivedServices.length}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox checked={form.acceptTerms} onCheckedChange={(v) => update("acceptTerms", !!v)} className="mt-0.5" />
                  <span className="text-sm text-muted-foreground">
                    Jeg accepterer <a href="#" className="text-primary underline">vilkår og betingelser</a> samt <a href="#" className="text-primary underline">privatlivspolitikken</a>
                  </span>
                </label>
                <div className="p-4 rounded-xl bg-success/10 border border-success/20 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-success">Hvad sker der nu?</p>
                    <p className="text-muted-foreground">Din ansøgning gennemgås af vores team inden for 24-48 timer. Du modtager en email når du er godkendt.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-border">
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)}>
                  Næste <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button disabled={!form.acceptTerms || hasPriceViolations} onClick={handleSubmit}>
                  {hasPriceViolations ? "Pris under grænse" : "Send ansøgning"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderRegister;
