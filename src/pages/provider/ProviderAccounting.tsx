import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BackButton from "@/components/BackButton";
import AccountingView from "@/components/accounting/AccountingView";
import AccountingDisclaimer from "@/components/accounting/AccountingDisclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AccountingPeriod,
  AccountingRulePack,
  CalculationResult,
  ExternalIncomeInput,
  JurisdictionResolution,
  ProviderAccountingProfile,
} from "@/lib/accounting";

interface AccountingPayload {
  provider: ProviderAccountingProfile;
  rulePack: AccountingRulePack | null;
  jurisdiction: JurisdictionResolution;
  period: AccountingPeriod;
  result: CalculationResult;
  monthlySummary?: { label: string; amountMinor: number }[];
  externalIncome?: ExternalIncomeInput[];
}


/**
 * /provider/accounting
 *
 * All legal outcomes come from the authoritative `accounting-calculate`
 * backend function. This page performs no tax logic of its own; when the
 * backend is not provisioned yet it says so instead of inventing a number.
 */
export default function ProviderAccounting() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<AccountingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const period = useMemo(() => currentQuarter(), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("accounting-calculate", {
          body: { periodStart: period.periodStart, periodEnd: period.periodEnd },
        });
        if (cancelled) return;
        if (error || !data) {
          setUnavailableReason(
            "Regnskabsmotoren er endnu ikke aktiveret for dette miljø. Bilagsopsamling og eksport understøttes fortsat.",
          );
          setPayload(null);
        } else {
          setPayload(data as AccountingPayload);
          setUnavailableReason(null);
        }
      } catch {
        if (!cancelled) {
          setUnavailableReason(
            "Regnskabsmotoren kunne ikke kontaktes. Prøv igen senere — der vises ikke et beregnet beløb, før motoren svarer.",
          );
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, period.periodStart, period.periodEnd]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <BackButton />
      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Henter dit regnskab…</span>
        </div>
      ) : payload ? (
        <AccountingView
          provider={payload.provider}
          rulePack={payload.rulePack}
          jurisdiction={payload.jurisdiction}
          period={payload.period}
          result={payload.result}
          externalIncome={payload.externalIncome ?? []}
          monthlySummary={payload.monthlySummary}
          onCheckDetails={() => navigate("/provider/profile")}
        />

      ) : (
        <div className="space-y-4">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dit regnskab</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Få overblik over indtjening, udgifter, transport og relevante skatter efter reglerne
              for dit registreringsland.
            </p>
          </header>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Beløbet kan endnu ikke beregnes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{unavailableReason}</p>
              <p>Bilagsopsamling og eksport understøttes.</p>
              <p>Automatisk skattevejledning er endnu ikke aktiveret.</p>
            </CardContent>
          </Card>
          <AccountingDisclaimer />
        </div>
      )}
    </main>
  );
}

function currentQuarter(): AccountingPeriod {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const start = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3 + 3, 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    kind: "quarterly",
    status: "open",
  };
}
