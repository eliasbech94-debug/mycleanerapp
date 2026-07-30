import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AccountingRulePack,
  IndirectTaxType,
  ProviderRegistrationType,
} from "@/lib/accounting";

const REGISTRATION_TYPES: ProviderRegistrationType[] = [
  "individual",
  "sole_trader",
  "self_employed",
  "company",
  "partnership",
  "other",
];

const TAX_TYPES: IndirectTaxType[] = ["vat", "gst", "sales_tax", "none", "unknown"];

export interface TabProps {
  pack: AccountingRulePack;
  readOnly: boolean;
  onChange: (patch: Partial<AccountingRulePack>) => void;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function RulePackGeneralTab({ pack, readOnly, onChange }: TabProps) {
  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generelt</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field id="general-country" label="Landekode (ISO 3166-1 alpha-2)">
            <Input
              id="general-country"
              value={pack.countryCode}
              disabled={readOnly}
              onChange={(e) => onChange({ countryCode: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field id="general-region" label="Region / delstat" hint="Valgfrit. Bruges til fx US-TX.">
            <Input
              id="general-region"
              value={pack.regionCode ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ regionCode: e.target.value || null })}
            />
          </Field>
          <Field id="general-version" label="Rule pack version">
            <Input
              id="general-version"
              value={pack.rulePackVersion}
              disabled={readOnly}
              onChange={(e) => onChange({ rulePackVersion: e.target.value })}
            />
          </Field>
          <Field id="general-source-version" label="Source version">
            <Input
              id="general-source-version"
              value={pack.sourceVersion ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ sourceVersion: e.target.value || null })}
            />
          </Field>
          <Field id="general-from" label="Effective from">
            <Input
              id="general-from"
              type="date"
              value={pack.effectiveFrom}
              disabled={readOnly}
              onChange={(e) => onChange({ effectiveFrom: e.target.value })}
            />
          </Field>
          <Field id="general-to" label="Effective to" hint="Tomt = gælder indtil videre.">
            <Input
              id="general-to"
              type="date"
              value={pack.effectiveTo ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ effectiveTo: e.target.value || null })}
            />
          </Field>
          <Field id="general-currency" label="Default currency (ISO 4217)">
            <Input
              id="general-currency"
              value={pack.defaultCurrency}
              disabled={readOnly}
              onChange={(e) => onChange({ defaultCurrency: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field id="general-locale" label="Default locale" hint="Fx da-DK eller en-GB.">
            <Input
              id="general-locale"
              value={pack.defaultLocale}
              disabled={readOnly}
              onChange={(e) => onChange({ defaultLocale: e.target.value })}
            />
          </Field>
          <Field
            id="general-supported-currencies"
            label="Supported currencies"
            hint="Kommasepareret liste."
          >
            <Input
              id="general-supported-currencies"
              value={pack.supportedCurrencies.join(", ")}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  supportedCurrencies: e.target.value
                    .split(",")
                    .map((v) => v.trim().toUpperCase())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Understøttede registreringstyper</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {REGISTRATION_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={pack.supportedRegistrationTypes.includes(type)}
                disabled={readOnly}
                onCheckedChange={() =>
                  onChange({
                    supportedRegistrationTypes: toggle(pack.supportedRegistrationTypes, type),
                  })
                }
              />
              {type}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Understøttede indirekte skattetyper</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {TAX_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={pack.supportedIndirectTaxTypes.includes(type)}
                disabled={readOnly}
                onCheckedChange={() =>
                  onChange({
                    supportedIndirectTaxTypes: toggle(pack.supportedIndirectTaxTypes, type),
                  })
                }
              />
              {type}
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
