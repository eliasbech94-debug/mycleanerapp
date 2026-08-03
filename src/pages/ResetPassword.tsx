import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveHomeForCurrentUser } from "@/lib/roleRedirect";
import { AuthShell, AuthCard, EarlyAccessChip } from "@/components/auth/AuthShell";
import { AuthPasswordField, AuthSubmit, AuthNotice } from "@/components/auth/AuthFields";

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
          <div className="mt-8 grid place-items-center gap-3" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(222_88%_42%)]" aria-hidden="true" />
            <p className="text-sm text-[hsl(224_20%_42%)]">Kontrollerer dit link…</p>
          </div>
        ) : !hasRecoverySession ? (
          <div className="mt-4 space-y-4">
            <AuthNotice tone="warning" title="Linket virker ikke længere">
              Gendannelseslinket er udløbet eller allerede brugt. Bed om et nyt link fra login-siden.
            </AuthNotice>
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center rounded-lg px-1 text-sm font-semibold text-[hsl(222_88%_42%)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
            >
              Til login
            </Link>
          </div>
        ) : done ? (
          <div className="mt-4">
            <AuthNotice tone="success" title="Adgangskoden er opdateret">
              Du er logget ind — vi sender dig videre om et øjeblik.
            </AuthNotice>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <AuthPasswordField
              label="Ny adgangskode"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(undefined); }}
              disabled={submitting}
              error={passwordError}
              hint="Mindst 6 tegn."
            />
            <AuthPasswordField
              label="Bekræft adgangskode"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); if (confirmError) setConfirmError(undefined); }}
              disabled={submitting}
              error={confirmError}
            />
            <AuthSubmit loading={submitting} disabled={submitting}>
              Opdater adgangskode
              {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </AuthSubmit>
          </form>
        )}
      </AuthCard>
    </AuthShell>
  );
}

