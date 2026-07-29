import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveHomeForCurrentUser } from "@/lib/roleRedirect";
import { AuthShell, AuthCard, EarlyAccessChip } from "@/components/auth/AuthShell";
import { AuthPasswordField, AuthSubmit } from "@/components/auth/AuthFields";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();

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
    if (submitting) return;
    setPasswordError(undefined);
    setConfirmError(undefined);
    if (password.length < 6) {
      toast.error("Adgangskoden skal være mindst 6 tegn");
      setPasswordError("Adgangskoden skal være mindst 6 tegn");
      return;
    }
    if (password !== confirm) {
      toast.error("Adgangskoderne matcher ikke");
      setConfirmError("Adgangskoderne matcher ikke");
      return;
    }
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
      setPasswordError("Vi kunne ikke opdatere adgangskoden. Prøv igen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell panelText="Vælg en ny adgangskode og fortsæt, hvor du slap.">
      <AuthCard>
        <EarlyAccessChip />
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">
          Vælg ny adgangskode
        </h1>

        {checking ? (
          <div className="mt-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !hasRecoverySession ? (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-[hsl(224_20%_42%)]">
              Linket er udløbet eller ugyldigt. Anmod om et nyt gendannelseslink fra login-siden.
            </p>
            <Link to="/login" className="inline-block text-sm font-semibold text-[hsl(222_88%_42%)] underline">
              Til login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <AuthPasswordField
              label="Ny adgangskode"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || done}
              error={passwordError}
              hint="Mindst 6 tegn."
            />
            <AuthPasswordField
              label="Bekræft adgangskode"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting || done}
              error={confirmError}
            />
            <AuthSubmit loading={submitting} disabled={submitting || done}>
              Opdater adgangskode
              {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </AuthSubmit>
            {done && (
              <p className="text-center text-sm font-medium text-emerald-700">
                Adgangskoden er opdateret — sender dig videre…
              </p>
            )}
          </form>
        )}
      </AuthCard>
    </AuthShell>
  );
}
