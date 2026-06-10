import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a" };

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const explicitRedirect = params.get("redirect");

  async function resolveDestination(): Promise<string> {
    if (explicitRedirect) return explicitRedirect;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "/profil";
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const r = (roles ?? []).map((x: any) => x.role);
    if (r.includes("super_admin") || r.includes("admin")) return "/admin";
    if (r.includes("employee")) return "/employee";
    if (r.includes("provider")) return "/provider-dashboard";
    return "/profil";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${explicitRedirect ?? "/profil"}`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Konto oprettet — du er logget ind");
        navigate(await resolveDestination());
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Velkommen tilbage");
        navigate(await resolveDestination());
      }
    } catch (err: any) {
      toast.error(err?.message || "Noget gik galt");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${explicitRedirect ?? "/profil"}`,
    });
    if (result.error) {
      toast.error("Google login fejlede");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate(await resolveDestination());
  }

  return (
    <main className="min-h-screen font-editorial grid place-items-center px-4" style={{ background: C.cream, color: C.ink }}>
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center text-[10px] font-black uppercase tracking-[0.28em] opacity-60 hover:opacity-100">
          ← MyCleaner
        </Link>
        <div className="mt-6 rounded-3xl border-2 bg-white p-7 shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
          <h1 className="font-display text-3xl">{mode === "signin" ? "Velkommen tilbage" : "Opret konto"}</h1>
          <p className="mt-1 text-sm opacity-70">
            {mode === "signin" ? "Log ind for at booke og se din profil." : "Få adgang til hurtigere booking næste gang."}
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border-2 bg-white py-3 text-sm font-bold transition hover:-translate-y-0.5 disabled:opacity-50"
            style={{ borderColor: C.ink }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A8.99 8.99 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.32z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            Fortsæt med Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">
            <div className="h-px flex-1" style={{ background: C.ink }} /> eller email
            <div className="h-px flex-1" style={{ background: C.ink }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Fulde navn</label>
                <input
                  type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none"
                  style={{ borderColor: `${C.ink}33` }}
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none"
                style={{ borderColor: `${C.ink}33` }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Adgangskode</label>
              <input
                type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none"
                style={{ borderColor: `${C.ink}33` }}
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: C.orange, color: C.ink }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                {mode === "signin" ? "Log ind" : "Opret konto"} <ArrowRight className="h-4 w-4" />
              </>}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-sm opacity-70 hover:opacity-100"
          >
            {mode === "signin"
              ? "Har du ikke en konto? Opret en"
              : "Har du allerede en konto? Log ind"}
          </button>
        </div>
      </div>
    </main>
  );
}
