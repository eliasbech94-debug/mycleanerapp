import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";

type KeyInfo = {
  configured: boolean;
  valid?: boolean;
  mode?: "test" | "live" | "unknown";
  error?: string;
};

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
  secret?: KeyInfo;
  publishable?: KeyInfo;
  modes_match?: boolean | null;
};

function KeyBadge({ info }: { info?: KeyInfo }) {
  if (!info || !info.configured) {
    return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Ikke sat</Badge>;
  }
  if (info.valid) {
    return <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Gyldig</Badge>;
  }
  return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Ugyldig</Badge>;
}

function ModeBadge({ mode }: { mode?: "test" | "live" | "unknown" }) {
  if (!mode || mode === "unknown") return <Badge variant="secondary">UKENDT</Badge>;
  return (
    <Badge variant={mode === "live" ? "default" : "secondary"} className={mode === "live" ? "bg-orange-500" : ""}>
      {mode === "test" ? "TEST MODE" : "LIVE MODE"}
    </Badge>
  );
}

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

  const secret = status?.secret;
  const publishable = status?.publishable;
  const modesMatch = status?.modes_match;

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-10 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-4xl text-foreground">Stripe konfiguration</h1>
            <p className="text-muted-foreground mt-1">Automatisk kontrol af publishable key og secret key</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Opdater
          </Button>
        </div>

        {/* Overall mode banner */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Nøglestatus</CardTitle>
              <div className="flex items-center gap-2">
                {modesMatch === false ? (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Modes matcher ikke</Badge>
                ) : modesMatch === true ? (
                  <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Bekræftet</Badge>
                ) : null}
                <ModeBadge mode={secret?.mode ?? status?.mode} />
              </div>
            </div>
            <CardDescription>
              Begge nøgler valideres direkte mod Stripes API. Modes (test/live) skal være ens for at betalinger fungerer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Secret key row */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="font-semibold">Secret key</div>
                <div className="text-xs text-muted-foreground font-mono">STRIPE_SECRET_KEY · sk_…</div>
                {secret?.error && (
                  <div className="text-xs text-destructive mt-1">{secret.error}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ModeBadge mode={secret?.mode} />
                <KeyBadge info={secret} />
              </div>
            </div>

            {/* Publishable key row */}
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">Publishable key</div>
                <div className="text-xs text-muted-foreground font-mono">STRIPE_PUBLISHABLE_KEY · pk_…</div>
                {publishable?.error && (
                  <div className="text-xs text-destructive mt-1">{publishable.error}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ModeBadge mode={publishable?.mode} />
                <KeyBadge info={publishable} />
              </div>
            </div>

            {modesMatch === false && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                Secret key er i <strong>{secret?.mode}</strong> mode, men publishable key er i <strong>{publishable?.mode}</strong> mode. Opdater den ene så de matcher.
              </div>
            )}

            <div className="bg-muted p-4 rounded-md text-sm space-y-2">
              <p className="font-semibold">Skift mellem test og live:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Gå til Lovable backend → Secrets</li>
                <li>Opdater både <code className="bg-background px-1 rounded">STRIPE_SECRET_KEY</code> og <code className="bg-background px-1 rounded">STRIPE_PUBLISHABLE_KEY</code> til samme mode</li>
                <li>Klik "Opdater" her for at re-teste</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {status?.account && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Kontooplysninger</CardTitle>
              <CardDescription>Oplysninger hentet fra platformens Stripe-konto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Account ID" value={status.account.id} />
              <Row label="Email" value={status.account.email ?? "—"} />
              <Row label="Virksomhed" value={status.account.business_profile?.name ?? "—"} />
              <Row label="Land" value={status.account.country ?? "—"} />
              <Row label="Standard valuta" value={status.account.default_currency?.toUpperCase() ?? "—"} />
              <Row label="Kan modtage betalinger" value={status.account.charges_enabled ? "Ja" : "Nej"} />
              <Row label="Udbetaling aktiveret" value={status.account.payouts_enabled ? "Ja" : "Nej"} />
              <Row label="Onboarding fuldført" value={status.account.details_submitted ? "Ja" : "Nej"} />
              <a
                href={secret?.mode === "live" ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test"}
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
