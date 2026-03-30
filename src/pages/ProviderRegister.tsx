import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ArrowLeft, Building2, User, Upload, Shield, CheckCircle2 } from "lucide-react";
import { countries, serviceCategories } from "@/lib/countries";

const steps = ["Type", "Personlig info", "Services & område", "Dokumenter", "Gennemse"];

const ProviderRegister = () => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    type: "private" as "private" | "business",
    firstName: "", lastName: "", email: "", phone: "",
    companyName: "", cvr: "",
    country: "DK",
    city: "", postalCode: "",
    categories: [] as string[],
    radius: "25",
    bio: "",
    acceptTerms: false,
  });

  const update = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));
  const toggleCategory = (id: string) => {
    setForm((p) => ({
      ...p,
      categories: p.categories.includes(id) ? p.categories.filter((c) => c !== id) : [...p.categories, id],
    }));
  };
  const country = countries.find((c) => c.code === form.country) || countries[0];

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
                  <p className="font-medium text-info">💡 AI prisforslag</p>
                  <p className="text-muted-foreground mt-1">
                    Minimum timepris i {country.name}: <strong>{country.currencySymbol}{country.minHourlyRate}</strong> ({country.laborAgreement}).
                    Vores AI foreslår markedspriser, så du tjener fair.
                  </p>
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
                <Button disabled={!form.acceptTerms}>Send ansøgning</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderRegister;
