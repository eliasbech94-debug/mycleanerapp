import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, RefreshCcw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IdentityStatusBadge } from "./IdentityStatusBadge";

type StatusPayload = {
  identityId: string | null;
  applicantId: string | null;
  status: "unverified" | "pending" | "approved" | "rejected" | "on_hold" | "expired" | null;
  level: "provider" | "customer" | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  error?: string;
};

/**
 * Dashboard card for identity verification.
 * - Read-only status view + entry point to /verify-identity.
 * - Never marks user verified; trusts only backend status.
 * - Auto-polls every 30s while pending/on_hold.
 */
export function IdentityVerificationCard() {
  const [state, setState] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      const { data, error } = await supabase.functions.invoke<StatusPayload>(
        "identity-status" + (refresh ? "?refresh=1" : ""),
        { method: refresh ? "POST" : "GET" },
      );
      if (error) throw error;
      setState(data ?? null);
    } catch (e) {
      setState({ identityId: null, applicantId: null, status: "unverified", level: null, verifiedAt: null, expiresAt: null, error: (e as Error).message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    if (!state) return;
    if (state.status === "pending" || state.status === "on_hold") {
      const t = setInterval(() => load(true), 30_000);
      return () => clearInterval(t);
    }
  }, [state, load]);

  const disabled = state?.error === "identity_disabled";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Identitetsverifikation
        </CardTitle>
        <IdentityStatusBadge status={state?.status ?? "unverified"} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Henter status…</p>
        ) : disabled ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5" aria-hidden />
            Identitetsverifikation er endnu ikke aktiveret. Du bliver informeret, når det åbner.
          </p>
        ) : state?.status === "approved" ? (
          <p className="text-muted-foreground">
            Din identitet er verificeret{state.verifiedAt ? ` (${new Date(state.verifiedAt).toLocaleDateString("da-DK")})` : ""}.
          </p>
        ) : state?.status === "pending" || state?.status === "on_hold" ? (
          <p className="text-muted-foreground">
            Din verifikation er under gennemgang. Vi opdaterer automatisk.
          </p>
        ) : state?.status === "rejected" ? (
          <p className="text-muted-foreground">
            Din verifikation blev afvist. Start en ny verifikation for at prøve igen.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Verificér din identitet for at bygge tillid hos kunder. Det er frivilligt lige nu.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button asChild size="sm" disabled={disabled}>
            <Link to="/verify-identity">
              {state?.status === "approved" ? "Se detaljer" : "Start verifikation"}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => load(true)}
            disabled={refreshing || disabled}
            aria-label="Opdater status"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
