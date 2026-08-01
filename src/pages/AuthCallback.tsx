import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveHomeForCurrentUser } from "@/lib/roleRedirect";
import { recordAcceptances } from "@/lib/legalAcceptance";

type SignupRole = "customer" | "provider";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const isRecovery = params.get("type") === "recovery" || /(?:^|[#&])type=recovery/.test(hash);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (isRecovery) {
        navigate("/reset-password" + (next ? `?next=${encodeURIComponent(next)}` : ""), { replace: true });
        return;
      }

      for (let i = 0; i < 20; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;

      try {
        const pending = sessionStorage.getItem("pendingLegalAcceptances");
        if (pending) {
          const docs = JSON.parse(pending);
          const { data: { user } } = await supabase.auth.getUser();
          if (user && Array.isArray(docs) && docs.length) await recordAcceptances(user.id, docs);
          sessionStorage.removeItem("pendingLegalAcceptances");
        }
      } catch { /* non-fatal */ }

      let claimedRole: SignupRole | null = null;
      try {
        const pendingRole = sessionStorage.getItem("pendingSignupRole") as SignupRole | null;
        const signupMode = sessionStorage.getItem("pendingSignupMode") === "true";
        if (signupMode && (pendingRole === "customer" || pendingRole === "provider")) {
          const { error } = await (supabase.rpc as any)("claim_signup_role", { requested_role: pendingRole });
          if (error) throw error;
          claimedRole = pendingRole;
        }
      } catch (err) {
        console.error("signup_role_claim_failed", err);
      } finally {
        sessionStorage.removeItem("pendingSignupRole");
        sessionStorage.removeItem("pendingSignupMode");
      }

      try { await supabase.functions.invoke("provider-recompute"); } catch { /* non-fatal */ }

      const dest = next || (claimedRole === "provider" ? "/provider-onboarding" : await resolveHomeForCurrentUser());
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
