import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveHomeForCurrentUser } from "@/lib/roleRedirect";
import { recordAcceptances } from "@/lib/legalAcceptance";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const isRecovery =
    params.get("type") === "recovery" || /(?:^|[#&])type=recovery/.test(hash);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (isRecovery) {
        navigate("/reset-password" + (next ? `?next=${encodeURIComponent(next)}` : ""), { replace: true });
        return;
      }
      // Wait briefly for session hydration
      for (let i = 0; i < 20; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;

      // Flush pending legal acceptances captured pre-verification.
      try {
        const pending = sessionStorage.getItem("pendingLegalAcceptances");
        if (pending) {
          const docs = JSON.parse(pending);
          const { data: { user } } = await supabase.auth.getUser();
          if (user && Array.isArray(docs) && docs.length) {
            await recordAcceptances(user.id, docs);
          }
          sessionStorage.removeItem("pendingLegalAcceptances");
        }
      } catch { /* non-fatal */ }

      // Reconcile provider onboarding after email verification (safe no-op
      // if no provider_profiles row exists).
      try {
        await supabase.functions.invoke("provider-recompute");
      } catch { /* non-fatal */ }

      const dest = next || (await resolveHomeForCurrentUser());
      navigate(dest, { replace: true });
    }
    go();
    return () => { cancelled = true; };
  }, [navigate, next, isRecovery]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[hsl(210_60%_98%)] px-6">
      <div className="flex flex-col items-center gap-3 text-center" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(222_88%_42%)]" aria-hidden="true" />
        <p className="text-base font-semibold text-[hsl(224_45%_16%)]">Bekræfter din konto…</p>
        <p className="max-w-xs text-sm text-[hsl(224_20%_42%)]">
          Vi logger dig ind og sender dig videre om et øjeblik.
        </p>
      </div>
    </main>
  );
}


