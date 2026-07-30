import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AccountingRulePack,
  JurisdictionResolution,
  ProviderAccountingProfile,
} from "@/lib/accounting";

interface Props {
  provider: ProviderAccountingProfile;
  rulePack: AccountingRulePack | null;
  jurisdiction: JurisdictionResolution;
  onOpenRules: () => void;
  onCheckDetails?: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function JurisdictionCard({
  provider,
  rulePack,
  jurisdiction,
  onOpenRules,
  onCheckDetails,
}: Props) {
  const resolved = jurisdiction.status === "resolved" ? jurisdiction : null;
  const registrationLabel =
    (provider.registrationType &&
      rulePack?.labels.registrationTypeLabels[provider.registrationType]) ||
    provider.registrationType ||
    "Ikke oplyst";

  const indirectTaxLabel = !rulePack?.indirectTaxEnabled
    ? "Ikke relevant i dette regelsæt"
    : provider.indirectTaxRegistered === true
      ? `Registreret (${rulePack.labels.indirectTaxLabel})`
      : provider.indirectTaxRegistered === false
        ? "Ikke registreret"
        : "Ukendt — kræver kontrol";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Regler anvendt</CardTitle>
          {resolved ? (
            <Badge variant="secondary">{resolved.rulePackVersion}</Badge>
          ) : (
            <Badge variant="destructive">Kræver kontrol</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          <Row
            label="Land"
            value={
              resolved?.countryCode ??
              (jurisdiction.status === "requires_review" && jurisdiction.candidateCountries.length > 0
                ? jurisdiction.candidateCountries.join(", ")
                : "Ikke oplyst")
            }
          />
          <Row label="Registrering" value={String(registrationLabel)} />
          <Row label="Indirekte skat" value={indirectTaxLabel} />
          <Row label="Regelversion" value={resolved?.rulePackVersion ?? "—"} />
          <Row label="Valuta" value={resolved?.currency ?? provider.accountingCurrency ?? "—"} />
        </div>

        {jurisdiction.status === "requires_review" && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {jurisdiction.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCheckDetails}>
            Kontrollér oplysninger
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenRules}>
            Se regler for dit land
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
