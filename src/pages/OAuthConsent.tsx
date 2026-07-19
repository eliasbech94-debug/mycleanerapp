import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a" };

// Minimal typed shim for the beta supabase.auth.oauth namespace.
type OAuthResult = {
  data?: {
    client?: { name?: string; client_name?: string; redirect_uris?: string[] } | null;
    scope?: string;
    redirect_url?: string;
    redirect_to?: string;
  } | null;
  error?: { message: string } | null;
};
const oauth = (supabase.auth as unknown as {
  oauth: {
    getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
    approveAuthorization: (id: string) => Promise<OAuthResult>;
    denyAuthorization: (id: string) => Promise<OAuthResult>;
  };
}).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthResult["data"]>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Manglende authorization_id i URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?redirect=" + encodeURIComponent(next);
        return;
      }
      setUserEmail(sess.session.user.email ?? null);

      const res = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const immediate = res.data?.redirect_url ?? res.data?.redirect_to;
      if (immediate && !res.data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(res.data ?? null);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const res = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (res.error) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    const target = res.data?.redirect_url ?? res.data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Ingen redirect returneret fra autorisationsserveren.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center px-4 font-editorial" style={{ background: C.cream, color: C.ink }}>
        <div className="w-full max-w-md rounded-3xl border-2 bg-white p-7 shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
          <h1 className="font-display text-2xl">Kunne ikke indlæse anmodning</h1>
          <p className="mt-3 text-sm opacity-80">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: C.cream }}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "en ekstern klient";
  const scopes = (details.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <main className="grid min-h-screen place-items-center px-4 font-editorial" style={{ background: C.cream, color: C.ink }}>
      <div className="w-full max-w-md rounded-3xl border-2 bg-white p-7 shadow-[8px_8px_0_rgba(10,61,58,0.15)]" style={{ borderColor: C.ink }}>
        <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-60">MyCleaner · Agent-adgang</div>
        <h1 className="mt-2 font-display text-2xl">Forbind {clientName} til MyCleaner</h1>
        <p className="mt-3 text-sm opacity-80">
          {clientName} vil kunne kalde MyCleaners tilgængelige værktøjer, mens du er logget ind{userEmail ? ` som ${userEmail}` : ""}.
        </p>
        <div className="mt-5 rounded-2xl border-2 p-4 text-sm" style={{ borderColor: `${C.ink}22` }}>
          <div className="font-black uppercase text-[10px] tracking-[0.22em] opacity-70">Adgang</div>
          <ul className="mt-2 space-y-1">
            <li>• Læse din MyCleaner-profil</li>
            <li>• Se dine bookinger</li>
            <li>• Søge blandt providere</li>
          </ul>
          {scopes.length > 0 && (
            <div className="mt-3 text-xs opacity-70">Scopes: {scopes.join(", ")}</div>
          )}
        </div>
        <p className="mt-3 text-xs opacity-60">
          Dine RLS-regler og backend-politikker gælder stadig — {clientName} kan kun se det, du selv har adgang til.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-full border-2 bg-white py-3 text-xs font-bold uppercase tracking-[0.18em] disabled:opacity-50"
            style={{ borderColor: C.ink }}
          >
            Afvis
          </button>
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-full py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] disabled:opacity-50"
            style={{ background: C.orange, color: C.ink }}
          >
            {busy ? "…" : "Godkend"}
          </button>
        </div>
      </div>
    </main>
  );
}
