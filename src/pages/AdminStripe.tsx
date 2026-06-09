import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";

type Status = {
  configured: boolean;
  valid?: boolean;
  mode?: "test" | "live" | "unknown";
  error?: string;
  account?: {
    id: string;
    email?: string;
    country?: string;
    business_profile?: { name?: string };
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    default_currency?: string;
  };
};

export default function AdminStripe() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("stripe-status");
    if (error) setStatus({ configured: false, error: error.message });
    else setStatus(data as Status);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-10 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-4xl text-foreground">Stripe konfiguration</h1>
            <p className="text-muted-foreground mt-1">Status for din Stripe Connect integration</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Opdater
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Secret key</CardTitle>
              {status?.configured ? (
                status.valid ? (
                  <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Aktiv</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Ugyldig</Badge>
                )
              ) : (
                <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Ikke sat</Badge>
              )}
            </div>
            <CardDescription>
              Nøglen gemmes krypteret i Lovable Cloud og er kun tilgængelig fra backend (edge functions). Den vises aldrig i frontend eller database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status?.mode && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Mode:</span>
                <Badge variant={status.mode === "live" ? "default" : "secondary"} className={status.mode === "live" ? "bg-orange-500" : ""}>
                  {status.mode === "test" ? "TEST MODE" : status.mode === "live" ? "LIVE MODE" : "UKENDT"}
                </Badge>
              </div>
            )}
            {status?.error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{status.error}</div>
            )}
            <div className="bg-muted p-4 rounded-md text-sm space-y-2">
              <p className="font-semibold">Skift mellem test og live:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Gå til Lovable backend → Secrets</li>
                <li>Find <code className="bg-background px-1 rounded">STRIPE_SECRET_KEY</code></li>
                <li>Erstat værdien med din <code className="bg-background px-1 rounded">sk_live_...</code> nøgle</li>
                <li>Klik "Opdater" her for at bekræfte</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {status?.account && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Konto detaljer</CardTitle>
              <CardDescription>Information hentet fra din Stripe konto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Account ID" value={status.account.id} />
              <Row label="Email" value={status.account.email ?? "—"} />
              <Row label="Virksomhed" value={status.account.business_profile?.name ?? "—"} />
              <Row label="Land" value={status.account.country ?? "—"} />
              <Row label="Standard valuta" value={status.account.default_currency?.toUpperCase() ?? "—"} />
              <Row label="Kan modtage betalinger" value={status.account.charges_enabled ? "Ja" : "Nej"} />
              <Row label="Kan udbetale" value={status.account.payouts_enabled ? "Ja" : "Nej"} />
              <Row label="Onboarding fuldført" value={status.account.details_submitted ? "Ja" : "Nej"} />
              <a
                href={status.mode === "live" ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test"}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline pt-2"
              >
                Åbn Stripe dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        )}

        <div className="mt-6">
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">← Tilbage til admin</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
