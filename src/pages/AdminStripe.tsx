import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

function KeyBadge({ info, t }: { info?: KeyInfo; t: (k: string) => string }) {
  if (!info || !info.configured) {
    return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />{t("ops.stripe.keys.notSet")}</Badge>;
  }
  if (info.valid) {
    return <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />{t("ops.stripe.keys.valid")}</Badge>;
  }
  return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t("ops.stripe.keys.invalid")}</Badge>;
}

function ModeBadge({ mode, t }: { mode?: "test" | "live" | "unknown"; t: (k: string) => string }) {
  if (!mode || mode === "unknown") return <Badge variant="secondary">{t("ops.stripe.mode.unknown")}</Badge>;
  return (
    <Badge variant={mode === "live" ? "default" : "secondary"} className={mode === "live" ? "bg-orange-500" : ""}>
      {mode === "test" ? t("ops.stripe.mode.test") : t("ops.stripe.mode.live")}
    </Badge>
  );
}

export default function AdminStripe() {
  const { t } = useTranslation("admin");
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
            <h1 className="font-heading text-4xl text-foreground">{t("ops.stripe.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("ops.stripe.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("ops.stripe.refresh")}
          </Button>
        </div>

        {/* Overall mode banner */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{t("ops.stripe.keyStatus.title")}</CardTitle>
              <div className="flex items-center gap-2">
                {modesMatch === false ? (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t("ops.stripe.keyStatus.mismatch")}</Badge>
                ) : modesMatch === true ? (
                  <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />{t("ops.stripe.keyStatus.confirmed")}</Badge>
                ) : null}
                <ModeBadge mode={secret?.mode ?? status?.mode} t={t} />
              </div>
            </div>
            <CardDescription>
              {t("ops.stripe.keyStatus.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Secret key row */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="font-semibold">{t("ops.stripe.secretKey.label")}</div>
                <div className="text-xs text-muted-foreground font-mono">STRIPE_SECRET_KEY · sk_…</div>
                {secret?.error && (
                  <div className="text-xs text-destructive mt-1">{secret.error}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ModeBadge mode={secret?.mode} t={t} />
                <KeyBadge info={secret} t={t} />
              </div>
            </div>

            {/* Publishable key row */}
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{t("ops.stripe.publishableKey.label")}</div>
                <div className="text-xs text-muted-foreground font-mono">STRIPE_PUBLISHABLE_KEY · pk_…</div>
                {publishable?.error && (
                  <div className="text-xs text-destructive mt-1">{publishable.error}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ModeBadge mode={publishable?.mode} t={t} />
                <KeyBadge info={publishable} t={t} />
              </div>
            </div>

            {modesMatch === false && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {t("ops.stripe.keyStatus.mismatchDetail", { secretMode: secret?.mode, publishableMode: publishable?.mode })}
              </div>
            )}

            <div className="bg-muted p-4 rounded-md text-sm space-y-2">
              <p className="font-semibold">{t("ops.stripe.switchGuide.title")}</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>{t("ops.stripe.switchGuide.step1")}</li>
                <li>
                  {t("ops.stripe.switchGuide.step2Prefix")}{" "}
                  <code className="bg-background px-1 rounded">STRIPE_SECRET_KEY</code> {t("ops.stripe.switchGuide.step2And")}{" "}
                  <code className="bg-background px-1 rounded">STRIPE_PUBLISHABLE_KEY</code> {t("ops.stripe.switchGuide.step2Suffix")}
                </li>
                <li>{t("ops.stripe.switchGuide.step3")}</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {status?.account && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("ops.stripe.account.title")}</CardTitle>
              <CardDescription>{t("ops.stripe.account.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label={t("ops.stripe.account.accountId")} value={status.account.id} />
              <Row label={t("ops.stripe.account.email")} value={status.account.email ?? "—"} />
              <Row label={t("ops.stripe.account.business")} value={status.account.business_profile?.name ?? "—"} />
              <Row label={t("ops.stripe.account.country")} value={status.account.country ?? "—"} />
              <Row label={t("ops.stripe.account.defaultCurrency")} value={status.account.default_currency?.toUpperCase() ?? "—"} />
              <Row label={t("ops.stripe.account.chargesEnabled")} value={status.account.charges_enabled ? t("ops.stripe.account.yes") : t("ops.stripe.account.no")} />
              <Row label={t("ops.stripe.account.payoutsEnabled")} value={status.account.payouts_enabled ? t("ops.stripe.account.yes") : t("ops.stripe.account.no")} />
              <Row label={t("ops.stripe.account.onboardingComplete")} value={status.account.details_submitted ? t("ops.stripe.account.yes") : t("ops.stripe.account.no")} />
              <a
                href={secret?.mode === "live" ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test"}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline pt-2"
              >
                {t("ops.stripe.account.openDashboard")} <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        )}

        <div className="mt-6">
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">{t("ops.stripe.backToAdmin")}</Link>
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
