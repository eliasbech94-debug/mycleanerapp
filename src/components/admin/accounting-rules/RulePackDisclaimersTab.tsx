import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RulePackLabels } from "@/lib/accounting";
import type { TabProps } from "./RulePackGeneralTab";

const LABEL_FIELDS: [keyof RulePackLabels, string][] = [
  ["businessRegistrationLabel", "Betegnelse for virksomhedsregistrering"],
  ["indirectTaxLabel", "Betegnelse for indirekte skat"],
  ["indirectTaxNumberLabel", "Betegnelse for skattenummer"],
  ["taxIdentificationLabel", "Betegnelse for skatte-ID"],
  ["filingPeriodLabel", "Betegnelse for indberetningsperiode"],
  ["preliminaryAmountLabel", "Betegnelse for foreløbigt beløb"],
];

export default function RulePackDisclaimersTab({ pack, readOnly, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lokale betegnelser</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {LABEL_FIELDS.map(([field, label]) => (
            <div key={field} className="space-y-1">
              <label htmlFor={`label-${field}`} className="text-xs text-muted-foreground">{label}</label>
              <Input
                id={`label-${field}`}
                value={(pack.labels[field] as string) ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange({ labels: { ...pack.labels, [field]: e.target.value } })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disclaimers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label htmlFor="disclaimers" className="text-xs text-muted-foreground">
            Én disclaimer pr. linje. Mindst én er påkrævet — MyCleaner leverer ikke skatterådgivning.
          </label>
          <Textarea
            id="disclaimers"
            rows={6}
            value={pack.disclaimers.join("\n")}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ disclaimers: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Officielle vejledningslinks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label htmlFor="guidance-links" className="text-xs text-muted-foreground">
            Format pr. linje: Titel | https://...
          </label>
          <Textarea
            id="guidance-links"
            rows={4}
            value={pack.officialGuidanceLinks.map((l) => `${l.title} | ${l.url}`).join("\n")}
            disabled={readOnly}
            onChange={(e) =>
              onChange({
                officialGuidanceLinks: e.target.value
                  .split("\n")
                  .map((line) => line.split("|").map((part) => part.trim()))
                  .filter((parts) => parts[0])
                  .map((parts) => ({ title: parts[0], url: parts[1] ?? "" })),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
