import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GATE_KEYS, type GateKey } from "@/lib/providerApproval/gates";

const GATE_LABEL: Record<GateKey, string> = {
  identity: "Identitet (Sumsub)",
  photo: "Profilbillede",
  profile: "Profiloplysninger",
  services: "Aktiv service og pris",
  quiz: "MyCleaner-test",
  documents: "Forsikring/dokumenter",
  stripe: "Udbetalinger (Stripe)",
};

interface Props {
  userId: string;
  onChanged?: () => void;
}

/**
 * Admin view of the approval gates. Approve is only possible when every gate
 * is green — the server enforces the same rule.
 */
export default function ProviderApprovalPanel({ userId, onChanged }: Props) {
  const [gates, setGates] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("provider_approval_gates" as any, { _uid: userId });
    if (error) toast.error("Kunne ikke hente godkendelsesstatus");
    setGates((data as Record<string, unknown>) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (decision: "approve" | "reject" | "suspend" | "reopen") => {
    if (reason.trim().length < 5) {
      toast.error("Angiv en begrundelse på mindst 5 tegn");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_provider_approval_decision" as any, {
      _uid: userId, _decision: decision, _reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("gates_not_satisfied")
          ? "Alle krav skal være opfyldt, før du kan godkende"
          : "Handlingen kunne ikke gennemføres",
      );
      return;
    }
    toast.success("Afgørelsen er registreret");
    setReason("");
    await load();
    onChanged?.();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Henter godkendelsesstatus…
      </div>
    );
  }

  if (!gates || gates.error) {
    return <p className="py-6 text-sm text-muted-foreground">Ingen godkendelsesdata for denne provider.</p>;
  }

  const allGreen = gates.all_green === true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant={allGreen ? "default" : "secondary"}>
          {allGreen ? "Alle krav opfyldt" : "Krav mangler"}
        </Badge>
        <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Opdater">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <ul className="space-y-1">
        {GATE_KEYS.map((k) => {
          const ok = gates[k] === true;
          return (
            <li key={k} className="flex items-center gap-2 text-sm">
              {ok
                ? <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                : <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />}
              <span>{GATE_LABEL[k]}</span>
              <span className="sr-only">{ok ? "opfyldt" : "mangler"}</span>
            </li>
          );
        })}
      </ul>

      {gates.production === true && gates.sandbox_identity === true && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
          Identiteten stammer fra sandkassemiljøet og kan ikke bruges i produktion.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="approval-reason">Begrundelse (gemmes i revisionssporet)</Label>
        <Textarea
          id="approval-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!allGreen || busy} onClick={() => void decide("approve")}>
          Godkend
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("reopen")}>
          Send til gennemgang
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("suspend")}>
          Suspendér
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide("reject")}>
          Afvis
        </Button>
      </div>
    </div>
  );
}
