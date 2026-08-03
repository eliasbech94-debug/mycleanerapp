import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, Home, Sparkles, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { countries } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import Turnstile, { resetTurnstile } from "@/components/Turnstile";
import { fetchActiveRequiredDocs, recordAcceptances, type ActiveLegalDoc } from "@/lib/legalAcceptance";
import { friendlyAuthError } from "@/lib/auth/authErrors";

const propertyTypes = ["Lejlighed", "Rækkehus", "Villa", "Landejendom", "Erhverv", "Andet"];
const steps = ["Konto", "Dit hjem", "Præferencer"];

const C = {
  ink: "hsl(224 45% 16%)",
  orange: "hsl(222 88% 42%)",
  cream: "hsl(210 60% 98%)",
  paper: "#ffffff",
  teal: "hsl(192 90% 46%)",
  border: "hsl(222 40% 88%)",
};


const CustomerRegister = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);
  const [requiredDocs, setRequiredDocs] = useState<ActiveLegalDoc[]>([]);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
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

  // Load active required legal documents for the selected country/language.
  useEffect(() => {
    if (authed) return; // already accepted at prior signup
    const lang = (navigator.language || "da").slice(0, 2).toLowerCase();
    fetchActiveRequiredDocs(form.country, lang)
      .then((docs) => {
        if (!docs.length && lang !== "en") {
          return fetchActiveRequiredDocs(form.country, "en").then(setRequiredDocs);
        }
        setRequiredDocs(docs);
      })
      .catch(() => setRequiredDocs([]));
  }, [form.country, authed]);

  const update = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const canContinue = () => {
    if (step === 0) {
      if (!form.firstName || !form.lastName || !form.email || !form.phone) return false;
      if (!authed && form.password.length < 6) return false;
      if (!authed && requiredDocs.length > 0 && !acceptedLegal) return false;
      if (!authed && !captchaToken) return false;
      return true;
    }
    if (step === 1) return !!form.propertyType && !!form.address && !!form.city && !!form.postalCode;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const usedCaptcha = captchaToken;
    try {
      let userId: string | null = null;

      if (!authed) {
        if (!usedCaptcha) {
          toast.error("Bekræft venligst captcha-udfordringen først");
          setSubmitting(false);
          return;
        }
        // Server-side Turnstile verification before any auth call.
        const { data: verify, error: verifyErr } = await supabase.functions.invoke("captcha-verify", {
          body: { token: usedCaptcha, action: "customer-signup" },
        });
        if (verifyErr || !verify?.success) {
          toast.error("Captcha kunne ikke bekræftes — prøv igen");
          setCaptchaToken(null);
          resetTurnstile();
          setSubmitting(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/book`,
            data: { full_name: `${form.firstName} ${form.lastName}`.trim() },
            captchaToken: usedCaptcha,
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
            options: { captchaToken: usedCaptcha },
          } as any);
          if (signinErr || !signin.session) {
            toast.success("Konto oprettet — bekræft din email for at færdiggøre profilen");
            navigate("/login?redirect=/book");
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

      // Persist onboarding preferences (idempotent per user).
      const { error: prefErr } = await supabase.from("customer_preferences").upsert({
        user_id: userId,
        property_type: form.propertyType || null,
        property_size_sqm: form.propertySize ? parseInt(form.propertySize, 10) : null,
        floors: form.floors || null,
        has_garden: form.hasGarden,
        has_pets: form.hasPets,
        preferred_days: form.preferredDays,
        preferred_time: form.preferredTime || null,
      }, { onConflict: "user_id" });
      if (prefErr) console.warn("customer_preferences upsert failed", prefErr);

      // Record legal acceptances (post-auth so RLS passes). Non-fatal if it fails.
      if (requiredDocs.length && acceptedLegal) {
        try { await recordAcceptances(userId, requiredDocs); }
        catch (e) { console.warn("legal acceptance write failed", e); }
      }

      toast.success("Velkommen! Dit hjem er gemt — nu kan du booke");
      navigate("/book");
    } catch (err: any) {
      toast.error(friendlyAuthError(err, "signup"));
    } finally {
      setCaptchaToken(null);
      resetTurnstile();
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen" style={{ background: C.cream, color: C.ink }}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 border-b pb-7 sm:mb-10 sm:pb-9" style={{ borderColor: C.border }}>
            <p className="mb-3 inline-flex w-fit items-center rounded-full bg-[hsl(222_88%_42%/0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.orange }}>
              Early Access
            </p>
            <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              Opret dit hjem. Book din cleaner.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed opacity-75 sm:text-lg">
              Tre korte trin, så vi kan vise relevante cleaners, realistiske tider og den rigtige pris.
            </p>
          </div>

          <div className="mb-8 grid grid-cols-3 gap-2 sm:mb-10">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className="h-1.5 rounded-full transition-all" style={{ background: i <= step ? C.orange : "hsl(222 40% 88%)" }} />
                <p className={`mt-2 text-[11px] font-semibold ${i === step ? "" : "opacity-45"}`}>{s}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border p-5 shadow-[0_18px_40px_-24px_hsl(222_88%_42%/0.45)] sm:p-8" style={{ background: C.paper, borderColor: C.border }}>
            {step === 0 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-bold tracking-tight">Først: hvem er du?</h2>
                {authed && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 text-success px-3 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Du er allerede logget ind
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cr-first">Fornavn</Label>
                    <Input id="cr-first" autoComplete="given-name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="cr-last">Efternavn</Label>
                    <Input id="cr-last" autoComplete="family-name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="cr-email">Email</Label>
                  <Input id="cr-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} disabled={authed} onChange={(e) => update("email", e.target.value)} />
                </div>
                {!authed && (
                  <div>
                    <Label htmlFor="cr-password">Adgangskode</Label>
                    <div className="relative">
                      <Input
                        id="cr-password"
                        type={showPassword ? "text" : "password"}
                        minLength={6}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        placeholder="Mindst 6 tegn"
                        className="pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Skjul adgangskode" : "Vis adgangskode"}
                        aria-pressed={showPassword}
                        className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" aria-hidden="true" /> : <Eye className="h-4.5 w-4.5" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="cr-phone">Telefon</Label>
                  <Input id="cr-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cr-country">Land</Label>
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger id="cr-country"><SelectValue /></SelectTrigger>
                    <SelectContent>{countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {!authed && requiredDocs.length > 0 && (
                  <label htmlFor="cr-legal" className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
                    <span className="grid h-6 w-6 shrink-0 place-items-center">
                      <input id="cr-legal" type="checkbox" required checked={acceptedLegal} onChange={(e) => setAcceptedLegal(e.target.checked)} className="h-[18px] w-[18px] cursor-pointer accent-primary" />
                    </span>
                    <span>
                      Jeg accepterer{" "}
                      <a href="/regler" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">vilkårene</a>{" "}
                      og{" "}
                      <a href="/privatliv" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">privatlivspolitikken</a>
                      <span className="mt-1 block text-[11px] opacity-60">
                        {requiredDocs.map((d) => `${d.kind}@${d.version}`).join(", ")}
                      </span>
                    </span>
                  </label>
                )}

                {!authed && (
                  <div className="pt-2">
                    <Turnstile
                      action="customer-signup"
                      onToken={setCaptchaToken}
                      onExpire={() => setCaptchaToken(null)}
                    />
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <Home className="h-5 w-5" style={{ color: C.orange }} /> Dit hjem
                </h2>
                <p className="text-sm leading-relaxed opacity-70">Oplysningerne bruges til rengøringen og deles kun med den cleaner, du booker.</p>
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
                <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <Sparkles className="h-5 w-5" style={{ color: C.orange }} /> Hvad passer dig bedst?
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
                  <p className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4" /> Bedre forslag fra start</p>
                  <p className="mt-1 text-sm opacity-70">
                    Vi bruger dine valg til at vise cleaners, som arbejder i dit område og passer til dine foretrukne tider. Du vælger altid selv.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between border-t pt-6" style={{ borderColor: C.border }}>
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
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opretter…</> : <>Gem og fortsæt til booking <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default CustomerRegister;
