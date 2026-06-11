import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveHomeForCurrentUser } from "@/lib/roleRedirect";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");

  useEffect(() => {
    let cancelled = false;
    async function go() {
      // Wait briefly for session hydration
      for (let i = 0; i < 20; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;
      const dest = next || (await resolveHomeForCurrentUser());
      navigate(dest, { replace: true });
    }
    go();
    return () => { cancelled = true; };
  }, [navigate, next]);

  return (
    <main className="grid min-h-screen place-items-center" style={{ background: "#f5f0e0" }}>
      <Loader2 className="h-6 w-6 animate-spin" />
    </main>
  );
}
