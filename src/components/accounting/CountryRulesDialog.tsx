import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AccountingRulePack,
  JurisdictionResolution,
  ProviderAccountingProfile,
} from "@/lib/accounting";

export default function CountryRulesDialog({
  open,
  onOpenChange,
  rulePack,
  provider,
  jurisdiction,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  rulePack: AccountingRulePack | null;
  provider: ProviderAccountingProfile;
  jurisdiction: JurisdictionResolution;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Regler for dit land</DialogTitle>
          <DialogDescription>
            Oversigten viser den regelversion, der er anvendt på den valgte periode.
          </DialogDescription>
        </DialogHeader>

        {!rulePack ? (
          <p className="text-sm text-muted-foreground">
            {jurisdiction.status === "requires_review"
              ? jurisdiction.message
              : "Der er ikke fundet en aktiv regelpakke."}
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <dl className="divide-y divide-border">
              <Line label="Aktivt land" value={`${rulePack.countryCode}${rulePack.regionCode ? `-${rulePack.regionCode}` : ""}`} />
              <Line label="Registreringstype" value={provider.registrationType ?? "Ikke oplyst"} />
              <Line
                label="Indirekte skattestatus"
                value={
                  provider.indirectTaxRegistered === true
                    ? `Registreret (${rulePack.labels.indirectTaxLabel})`
                    : provider.indirectTaxRegistered === false
                      ? "Ikke registreret"
                      : "Ukendt"
                }
              />
              <Line label="Anvendt regelversion" value={rulePack.rulePackVersion} />
              <Line label="Gyldig fra" value={rulePack.effectiveFrom} />
              <Line label="Gyldig til" value={rulePack.effectiveTo ?? "Ingen slutdato"} />
              <Line label="Seneste verificering" value={rulePack.verifiedAt ?? "Ikke verificeret"} />
            </dl>

            <div>
              <h3 className="font-medium text-foreground">Officielle kilder</h3>
              <ul className="mt-1 space-y-2">
                {rulePack.sources.map((source) => (
                  <li key={source.officialSourceUrl} className="text-muted-foreground">
                    <a
                      className="text-foreground underline underline-offset-2"
                      href={source.officialSourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {source.officialSourceName}
                    </a>
                    {source.sourceDocumentTitle ? ` — ${source.sourceDocumentTitle}` : ""}
                    {source.sourceCheckedAt ? ` (kontrolleret ${source.sourceCheckedAt})` : ""}
                  </li>
                ))}
              </ul>
            </div>

            {rulePack.disclaimers.length > 0 && (
              <ul className="space-y-1 rounded-md bg-muted p-3 text-muted-foreground">
                {rulePack.disclaimers.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
