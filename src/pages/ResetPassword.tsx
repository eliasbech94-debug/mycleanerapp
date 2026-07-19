import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveHomeForCurrentUser } from "@/lib/roleRedirect";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0" };

export default function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Recovery links land here as ?type=recovery or #type=recovery.
    // Supabase-js parses the URL hash automatically and creates a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasRecoverySession(true);
    });
    (async () => {
      // Small hydration wait
      for (let i = 0; i < 20; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { setHasRecoverySession(true); break; }
        await new Promise((r) => setTimeout(r, 100));
      }
      setChecking(false);
    })();
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error("Adgangskoden skal være mindst 6 tegn"); return; }
    if (password !== confirm) { toast.error("Adgangskoderne matcher ikke"); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Adgangskode opdateret");
      const dest = await resolveHomeForCurrentUser();
      setTimeout(() => navigate(dest, { replace: true }), 900);
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke opdatere adgangskoden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen font-editorial grid place-items-center px-4" style={{ background: C.cream, color: C.ink }}>
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center text-[10px] font-black uppercase tracking-[0.28em] opacity-60 hover:opacity-100">← MyCleaner</Link>
        <div className="mt-6 rounded-3xl border-2 bg-white p-7 shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
          <h1 className="font-display text-3xl">Vælg ny adgangskode</h1>
          {checking ? (
            <div className="mt-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !hasRecoverySession ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm opacity-70">
                Linket er udløbet eller ugyldigt. Anmod om et nyt gendannelseslink fra login-siden.
              </p>
              <Link to="/login" className="inline-block text-sm font-bold underline">Til login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Ny adgangskode</label>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none"
                  style={{ borderColor: `${C.ink}33` }} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Bekræft adgangskode</label>
                <input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none"
                  style={{ borderColor: `${C.ink}33` }} />
              </div>
              <button type="submit" disabled={submitting || done}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:opacity-50"
                style={{ background: C.orange, color: C.ink }}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Opdater adgangskode <ArrowRight className="h-4 w-4" /></>}
              </button>
              {done && <p className="text-center text-sm text-emerald-700">Adgangskoden er opdateret — sender dig videre…</p>}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
