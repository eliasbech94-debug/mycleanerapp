import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, Sparkles, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { fetchActiveRequiredDocs, recordAcceptances, type ActiveLegalDoc } from "@/lib/legalAcceptance";
import Turnstile, { resetTurnstile } from "@/components/Turnstile";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a" };
type Mode = "signin" | "signup" | "forgot";
type SignupRole = "customer" | "provider";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<SignupRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("DK");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [requiredDocs, setRequiredDocs] = useState<ActiveLegalDoc[]>([]);
  const [legalReady, setLegalReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const explicitRedirect = params.get("redirect") || params.get("next");
  const callbackUrl = `${window.location.origin}/auth/callback${explicitRedirect ? `?next=${encodeURIComponent(explicitRedirect)}` : ""}`;

  useEffect(() => {
    if (mode !== "signup") return;
    const lang = (navigator.language || "da").slice(0, 2).toLowerCase();
    (async () => {
      try {
        let docs = await fetchActiveRequiredDocs(country, lang);
        if (!docs.length && lang !== "en") docs = await fetchActiveRequiredDocs(country, "en");
        setRequiredDocs(docs);
        setLegalReady(docs.length > 0);
      } catch {
        setRequiredDocs([]);
        setLegalReady(false);
      }
    })();
  }, [mode, country]);

  async function destination() {
    if (explicitRedirect) return explicitRedirect;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "/customer";
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (data ?? []).map((x: any) => x.role);
    if (roles.includes("super_admin") || roles.includes("admin")) return "/admin";
    if (roles.includes("employee")) return "/employee";
    if (roles.includes("provider")) return "/provider-dashboard";
    return "/customer";
  }

  async function verifyCaptcha(token: string) {
    const { data, error } = await supabase.functions.invoke("captcha-verify", { body: { token, action: mode } });
    return !error && data?.success;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) return toast.error("Bekræft venligst captcha-udfordringen først");
    if (mode === "signup" && !role) return toast.error("Vælg om du vil oprette dig som kunde eller provider");
    setLoading(true);
    const token = captchaToken;
    try {
      if (!(await verifyCaptcha(token))) throw new Error("Captcha kunne ikke bekræftes — prøv igen");
      if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password`, captchaToken: token });
        toast.success("Hvis kontoen findes, sender vi et gendannelseslink til din email");
        setMode("signin");
        return;
      }
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: token } } as any);
        if (error) throw error;
        toast.success("Velkommen tilbage");
        navigate(await destination(), { replace: true });
        return;
      }
      if (!legalReady || !acceptedLegal) throw new Error("Du skal vælge rolle og acceptere vilkårene for at oprette en konto");
      const selectedRole = role as SignupRole;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl,
          data: { full_name: fullName, country_code: country, signup_role: selectedRole },
          captchaToken: token,
        },
      });
      if (error) throw error;
      const uid = data.session?.user?.id ?? data.user?.id;
      if (uid && data.session) {
        try { await recordAcceptances(uid, requiredDocs); } catch { /* non-fatal */ }
      } else {
        sessionStorage.setItem("pendingLegalAcceptances", JSON.stringify(requiredDocs));
      }
      sessionStorage.setItem("pendingSignupRole", selectedRole);
      toast.success("Konto oprettet");
      navigate(data.session ? (selectedRole === "provider" ? "/provider-onboarding" : "/customer") : "/login", { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Noget gik galt");
    } finally {
      setCaptchaToken(null);
      resetTurnstile();
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (mode === "signup" && !role) return toast.error("Vælg om du vil oprette dig som kunde eller provider");
    if (mode === "signup" && role) {
      sessionStorage.setItem("pendingSignupRole", role);
      sessionStorage.setItem("pendingSignupMode", "true");
    } else {
      sessionStorage.removeItem("pendingSignupRole");
      sessionStorage.removeItem("pendingSignupMode");
    }
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: callbackUrl });
    if (result.error) {
      toast.error("Google login fejlede");
      setLoading(false);
    } else if (!result.redirected) {
      navigate(await destination(), { replace: true });
    }
  }

  const title = mode === "signin" ? "Velkommen tilbage" : mode === "signup" ? "Opret konto" : "Glemt adgangskode";
  const inputClass = "mt-1 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 font-editorial" style={{ background: C.cream, color: C.ink }}>
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center text-[10px] font-black uppercase tracking-[0.28em] opacity-60">← MyCleaner</Link>
        <div className="mt-6 rounded-3xl border-2 bg-white p-7 shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
          <h1 className="font-display text-3xl">{title}</h1>
          <p className="mt-1 text-sm opacity-70">{mode === "signup" ? "Vælg først, hvordan du vil bruge MyCleaner." : mode === "signin" ? "Log ind for at booke og se din profil." : "Vi sender et gendannelseslink til din email."}</p>

          {mode === "signup" && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRole("customer")} className="rounded-2xl border-2 p-4 text-left" style={{ borderColor: role === "customer" ? C.teal : `${C.ink}33`, background: role === "customer" ? "#eefaf7" : "white" }}>
                <UserRound className="h-5 w-5" /><strong className="mt-2 block">Kunde</strong><span className="mt-1 block text-xs opacity-70">Find og book en verificeret cleaner.</span>
              </button>
              <button type="button" onClick={() => setRole("provider")} className="rounded-2xl border-2 p-4 text-left" style={{ borderColor: role === "provider" ? C.orange : `${C.ink}33`, background: role === "provider" ? "#fff4ee" : "white" }}>
                <Sparkles className="h-5 w-5" /><strong className="mt-2 block">Provider</strong><span className="mt-1 block text-xs opacity-70">Tilbyd rengøring og få nye kunder.</span>
              </button>
            </div>
          )}

          {mode !== "forgot" && <button type="button" onClick={handleGoogle} disabled={loading || (mode === "signup" && !role)} className="mt-6 w-full rounded-full border-2 py-3 font-bold disabled:opacity-50" style={{ borderColor: C.ink }}>Fortsæt med Google</button>}

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {mode === "signup" && <div><label className="text-xs font-bold">Fulde navn</label><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} style={{ borderColor: `${C.ink}33` }} /></div>}
            <div><label className="text-xs font-bold">Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} style={{ borderColor: `${C.ink}33` }} /></div>
            {mode !== "forgot" && <div><label className="text-xs font-bold">Adgangskode</label><input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} style={{ borderColor: `${C.ink}33` }} /></div>}
            {mode === "signup" && <>
              <div><label className="text-xs font-bold">Land</label><select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} style={{ borderColor: `${C.ink}33` }}><option value="DK">Danmark</option><option value="GB">United Kingdom</option><option value="SE">Sverige</option><option value="ES">Spanien</option></select></div>
              <label className="flex gap-2 rounded-xl border-2 p-3 text-sm" style={{ borderColor: `${C.ink}33` }}><input type="checkbox" checked={acceptedLegal} onChange={(e) => setAcceptedLegal(e.target.checked)} /><span>Jeg accepterer <Link to="/regler" target="_blank" className="underline">vilkårene</Link> og <Link to="/privatliv" target="_blank" className="underline">privatlivspolitikken</Link>.</span></label>
            </>}
            <Turnstile action={mode} onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
            <button type="submit" disabled={loading || !captchaToken || (mode === "signup" && (!role || !acceptedLegal || !legalReady))} className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:opacity-50" style={{ background: C.orange, color: C.ink }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{mode === "signin" ? "Log ind" : mode === "signup" ? "Opret konto" : "Send link"}<ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          {mode === "signin" && <button type="button" onClick={() => setMode("forgot")} className="mt-3 w-full text-xs underline">Glemt adgangskode?</button>}
          <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setRole(null); }} className="mt-4 w-full text-sm opacity-70">
            {mode === "signin" ? "Har du ikke en konto? Opret en" : mode === "signup" ? "Har du allerede en konto? Log ind" : "Tilbage til login"}
          </button>
        </div>
      </div>
    </main>
  );
}
