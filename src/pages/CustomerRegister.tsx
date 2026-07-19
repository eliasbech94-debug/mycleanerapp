import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, Home, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { countries } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { fetchActiveRequiredDocs, recordAcceptances, type ActiveLegalDoc } from "@/lib/legalAcceptance";

const propertyTypes = ["Lejlighed", "Rækkehus", "Villa", "Landejendom", "Erhverv", "Andet"];
const steps = ["Konto", "Bolig", "Præferencer"];

const CustomerRegister = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);
  const [requiredDocs, setRequiredDocs] = useState<ActiveLegalDoc[]>([]);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", password: "",
    country: "DK", city: "", postalCode: "", address: "",
    propertyType: "", propertySize: "", floors: "1", hasGarden: false, hasPets: false,
    preferredDays: [] as string[],
    preferredTime: "morning",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthed(true);
        const u = data.session.user;
        setForm((p) => ({
          ...p,
          email: u.email ?? p.email,
          firstName: p.firstName || (u.user_metadata?.full_name?.split(" ")[0] ?? ""),
          lastName: p.lastName || (u.user_metadata?.full_name?.split(" ").slice(1).join(" ") ?? ""),
        }));
      }
    });
  }, []);

  const update = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const canContinue = () => {
    if (step === 0) {
      if (!form.firstName || !form.lastName || !form.email || !form.phone) return false;
      if (!authed && form.password.length < 6) return false;
      return true;
    }
    if (step === 1) return !!form.propertyType && !!form.address && !!form.city && !!form.postalCode;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let userId: string | null = null;

      if (!authed) {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/profil`,
            data: { full_name: `${form.firstName} ${form.lastName}`.trim() },
          },
        });
        if (error) throw error;
        userId = data.user?.id ?? null;
        // If email confirmation is required, signUp returns no session.
        // Try logging in immediately — works when the project allows it.
        if (!data.session) {
          const { data: signin, error: signinErr } = await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });
          if (signinErr || !signin.session) {
            toast.success("Konto oprettet — bekræft din email for at færdiggøre profilen");
            navigate("/login?redirect=/profil");
            return;
          }
          userId = signin.user.id;
        }
      } else {
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id ?? null;
      }

      if (!userId) throw new Error("Bruger ikke fundet");

      const fullAddress = `${form.address}, ${form.postalCode} ${form.city}`.trim();

      const { error: pErr } = await supabase.from("profiles").upsert({
        id: userId,
        full_name: `${form.firstName} ${form.lastName}`.trim(),
        phone: form.phone,
        address: fullAddress,
        country_code: form.country,
      });
      if (pErr) throw pErr;

      const { error: aErr } = await supabase.from("customer_addresses").insert({
        user_id: userId,
        label: "Hjem",
        address: fullAddress,
        is_primary: true,
        place_type: "private",
        size_sqm: form.propertySize ? parseInt(form.propertySize, 10) : null,
        has_pets: form.hasPets,
        notes: [
          form.propertyType && `Boligtype: ${form.propertyType}`,
          form.floors && `Etager: ${form.floors}`,
          form.hasGarden && "Har have",
          form.preferredDays.length && `Foretrukne dage: ${form.preferredDays.join(", ")}`,
          form.preferredTime && `Foretrukket tid: ${form.preferredTime}`,
        ].filter(Boolean).join(" · ") || null,
      });
      if (aErr) throw aErr;

      toast.success("Velkommen! Din profil er oprettet");
      navigate("/profil");
    } catch (err: any) {
      toast.error(err?.message || "Noget gik galt");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container-narrow py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-heading text-3xl font-bold mb-2">Opret din profil</h1>
            <p className="text-muted-foreground">Jo mere du fortæller, jo bedre matching og tilbud får du</p>
          </div>

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
              <div className="space-y-5">
                <h2 className="font-heading text-xl font-semibold">Personlige oplysninger</h2>
                {authed && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 text-success px-3 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Du er allerede logget ind
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>Fornavn</Label><Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} /></div>
                  <div><Label>Efternavn</Label><Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={form.email} disabled={authed} onChange={(e) => update("email", e.target.value)} /></div>
                {!authed && (
                  <div>
                    <Label>Adgangskode</Label>
                    <Input type="password" minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Mindst 6 tegn" />
                  </div>
                )}
                <div><Label>Telefon</Label><Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
                <div>
                  <Label>Land</Label>
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                  <Home className="h-5 w-5 text-primary" /> Din bolig
                </h2>
                <p className="text-sm text-muted-foreground">Disse oplysninger hjælper os med at matche dig med de rette fagfolk og give præcise tilbud.</p>
                <div><Label>Adresse</Label><Input value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Vejnavn 123" /></div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>By</Label><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></div>
                  <div><Label>Postnummer</Label><Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} /></div>
                </div>
                <div>
                  <Label>Boligtype</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {propertyTypes.map((t) => (
                      <button key={t} onClick={() => update("propertyType", t)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${form.propertyType === t ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>Størrelse (m²)</Label><Input type="number" value={form.propertySize} onChange={(e) => update("propertySize", e.target.value)} placeholder="85" /></div>
                  <div>
                    <Label>Antal etager</Label>
                    <Select value={form.floors} onValueChange={(v) => update("floors", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["1", "2", "3", "4+"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => update("hasGarden", !form.hasGarden)}
                    className={`flex-1 p-4 rounded-xl border-2 text-sm text-center transition-all ${form.hasGarden ? "border-primary bg-primary/5" : "border-border"}`}>
                    🌿 Har have
                  </button>
                  <button onClick={() => update("hasPets", !form.hasPets)}
                    className={`flex-1 p-4 rounded-xl border-2 text-sm text-center transition-all ${form.hasPets ? "border-primary bg-primary/5" : "border-border"}`}>
                    🐾 Har kæledyr
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> Dine præferencer
                </h2>
                <div>
                  <Label className="mb-2 block">Foretrukne dage</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"].map((d) => (
                      <button key={d} onClick={() => {
                        const days = form.preferredDays.includes(d) ? form.preferredDays.filter((x) => x !== d) : [...form.preferredDays, d];
                        update("preferredDays", days);
                      }}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${form.preferredDays.includes(d) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Foretrukket tidspunkt</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[{ v: "morning", l: "🌅 Morgen" }, { v: "afternoon", l: "☀️ Eftermiddag" }, { v: "evening", l: "🌙 Aften" }].map((t) => (
                      <button key={t.v} onClick={() => update("preferredTime", t.v)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${form.preferredTime === t.v ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        {t.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-sm font-medium flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI-baseret matching</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Baseret på din bolig og præferencer finder vores AI de mest relevante fagfolk og giver dig dynamiske tilbud med fair priser.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t border-border">
              <BackButton
                variant="ghost"
                label={step === 0 ? "Tilbage" : "Forrige trin"}
                onBack={step === 0 ? undefined : () => setStep((s) => s - 1)}
                hidden={submitting}
              />
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue()}>
                  Næste <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opretter…</> : <>Opret profil <ArrowRight className="h-4 w-4 ml-2" /></>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerRegister;
