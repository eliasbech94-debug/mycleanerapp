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

      const dest = next || (await resolveHomeForCurrentUser());
      navigate(dest, { replace: true });
    }
    go();
    return () => { cancelled = true; };
  }, [navigate, next, isRecovery]);

  return (
    <main className="grid min-h-screen place-items-center" style={{ background: "#f5f0e0" }}>
      <Loader2 className="h-6 w-6 animate-spin" />
    </main>
  );
}

