import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { ExpenseTreatment, MileageMethod, MileageRuleBand } from "@/lib/accounting";
import type { TabProps } from "./RulePackGeneralTab";

const METHODS: MileageMethod[] = [
  "fixed_rate",
  "actual_vehicle_cost",
  "mixed_method",
  "not_supported",
  "manual_review",
];

const TREATMENTS: ExpenseTreatment[] = [
  "generally_allowed",
  "partially_allowed",
  "capital_asset",
  "special_review",
  "generally_disallowed",
];

const TRIP_FIELDS = [
  ["commutingTreatment", "Pendling"],
  ["homeToCustomerTreatment", "Hjem → kunde"],
  ["customerToCustomerTreatment", "Kunde → kunde"],
  ["parkingTreatment", "Parkering"],
  ["tollTreatment", "Broafgift / vejafgift"],
  ["publicTransportTreatment", "Offentlig transport"],
] as const;

export default function RulePackMileageTab({ pack, readOnly, onChange }: TabProps) {
  const rules = pack.mileageRules;
  const patch = (value: Partial<typeof rules>) => onChange({ mileageRules: { ...rules, ...value } });

  const updateBand = (index: number, value: Partial<MileageRuleBand>) =>
    patch({ rateBands: rules.rateBands.map((b, i) => (i === index ? { ...b, ...value } : b)) });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kørsel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="mileage-method" className="text-xs text-muted-foreground">Metode</label>
            <select
              id="mileage-method"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={rules.method}
              disabled={readOnly}
              onChange={(e) => patch({ method: e.target.value as MileageMethod })}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="mileage-unit" className="text-xs text-muted-foreground">Afstandsenhed</label>
            <select
              id="mileage-unit"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={rules.distanceUnit ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ distanceUnit: (e.target.value || null) as "km" | "mile" | null })}
            >
              <option value="">Ikke valgt</option>
              <option value="km">km</option>
              <option value="mile">mile</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="mileage-currency" className="text-xs text-muted-foreground">Valuta for satser</label>
            <Input
              id="mileage-currency"
              value={rules.currency ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ currency: e.target.value.toUpperCase() || null })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="mileage-vehicles" className="text-xs text-muted-foreground">
              Køretøjstyper (kommasepareret)
            </label>
            <Input
              id="mileage-vehicles"
              value={rules.vehicleTypes.join(", ")}
              disabled={readOnly}
              onChange={(e) =>
                patch({ vehicleTypes: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
              }
            />
          </div>
          {TRIP_FIELDS.map(([field, label]) => (
            <div key={field} className="space-y-1">
              <label htmlFor={`mileage-${field}`} className="text-xs text-muted-foreground">{label}</label>
              <select
                id={`mileage-${field}`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={rules[field]}
                disabled={readOnly}
                onChange={(e) => patch({ [field]: e.target.value as ExpenseTreatment })}
              >
                {TREATMENTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="mileage-docs" className="text-xs text-muted-foreground">
              Dokumentationskrav (én pr. linje)
            </label>
            <Textarea
              id="mileage-docs"
              value={rules.documentationRequirements.join("\n")}
              disabled={readOnly}
              onChange={(e) =>
                patch({
                  documentationRequirements: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Satsintervaller</CardTitle>
            <p className="text-xs text-muted-foreground">
              Sats i minor units pr. afstandsenhed. Heltal — aldrig decimaltal.
            </p>
          </div>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                patch({
                  rateBands: [
                    ...rules.rateBands,
                    {
                      vehicleType: rules.vehicleTypes[0] ?? "car",
                      minorPerDistanceUnit: 0,
                      fromDistance: 0,
                      toDistance: null,
                    },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              Tilføj interval
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.rateBands.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen satsintervaller.</p>
          )}
          {rules.rateBands.map((band, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-5">
              <div className="space-y-1">
                <label htmlFor={`band-vehicle-${index}`} className="text-xs text-muted-foreground">Køretøj</label>
                <Input
                  id={`band-vehicle-${index}`}
                  value={band.vehicleType}
                  disabled={readOnly}
                  onChange={(e) => updateBand(index, { vehicleType: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`band-rate-${index}`} className="text-xs text-muted-foreground">Minor pr. enhed</label>
                <Input
                  id={`band-rate-${index}`}
                  inputMode="numeric"
                  value={band.minorPerDistanceUnit}
                  disabled={readOnly}
                  onChange={(e) => updateBand(index, { minorPerDistanceUnit: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`band-from-${index}`} className="text-xs text-muted-foreground">Fra</label>
                <Input
                  id={`band-from-${index}`}
                  inputMode="numeric"
                  value={band.fromDistance}
                  disabled={readOnly}
                  onChange={(e) => updateBand(index, { fromDistance: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`band-to-${index}`} className="text-xs text-muted-foreground">
                  Til (tom = ingen grænse)
                </label>
                <Input
                  id={`band-to-${index}`}
                  inputMode="numeric"
                  value={band.toDistance ?? ""}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateBand(index, { toDistance: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-end">
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Slet satsinterval ${index + 1}`}
                    onClick={() => patch({ rateBands: rules.rateBands.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
