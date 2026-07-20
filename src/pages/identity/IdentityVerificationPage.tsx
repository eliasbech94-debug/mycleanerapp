import { useCallback, useEffect, useState } from "react";
import SumsubWebSdk from "@sumsub/websdk-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/BackButton";
import { IdentityStatusBadge } from "@/components/identity/IdentityStatusBadge";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Session = { token: string; expiresAt: string; applicantId: string; level: "provider" | "customer" };

/**
 * WebSDK host page.
 * Contract:
 * - Fetches a short-lived Sumsub token from `identity-create-session`.
 * - Refreshes tokens on demand via `identity-refresh-session` (SDK callback).
 * - Never trusts SDK events to mark the user as verified — status flows only
 *   from `identity-status` (which reflects webhook-processed state).
 */
export default function IdentityVerificationPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<Session & { error?: string }>(
        "identity-create-session",
        { method: "POST", body: {} },
      );
      if (error) throw error;
      if ((data as { error?: string })?.error === "identity_disabled") {
        setDisabled(true);
        setSession(null);
        return;
      }
      if (!data?.token) throw new Error("Ingen token modtaget");
      setSession(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { start(); }, [start]);

  // WebSDK calls this when the token nears expiry.
  const refreshToken = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke<{ token: string }>(
      "identity-refresh-session", { method: "POST", body: {} },
    );
    if (error || !data?.token) throw new Error("token_refresh_failed");
    return data.token;
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <BackButton />
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" aria-hidden /> Verificér din identitet
          </CardTitle>
          <IdentityStatusBadge status={session ? "pending" : null} />
        </CardHeader>
        <CardContent className="space-y-4">
          {disabled ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mt-0.5" aria-hidden />
              <p>
                Identitetsverifikation er ikke aktiv i produktion endnu. Din konto er ikke berørt.
                Du får besked, når det åbner.
              </p>
            </div>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Starter sikker session…</p>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700">Kunne ikke starte verifikation: {error}</p>
              <Button onClick={start} size="sm">Prøv igen</Button>
            </div>
          ) : session ? (
            <div className="rounded-md border overflow-hidden">
              <SumsubWebSdk
                accessToken={session.token}
                expirationHandler={refreshToken}
                config={{ lang: "da" }}
                options={{ addViewportTag: false, adaptIframeHeight: true }}
                onMessage={(type: string) => {
                  // Purely for UX feedback — status is authoritative from backend.
                  if (type === "idCheck.onApplicantSubmitted") {
                    toast.success("Dine dokumenter er indsendt. Vi behandler dem nu.");
                  }
                }}
                onError={(e: unknown) => {
                  console.warn("sumsub_sdk_error", e);
                  toast.error("Der opstod en fejl i verifikationsvinduet.");
                }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
