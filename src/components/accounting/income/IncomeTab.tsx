import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AddExternalIncomeDialog from "./AddExternalIncomeDialog";
import ImportIncomeDialog from "./ImportIncomeDialog";
import {
  EXTERNAL_INCOME_DOCUMENTATION_LABELS,
  EXTERNAL_INCOME_PAYMENT_STATUS_LABELS,
  EXTERNAL_INCOME_SOURCE_LABELS,
  EXTERNAL_INCOME_RESPONSIBILITY_TEXT,
  INCOME_TAB_HELPER_TEXT,
  formatMinor,
  type AccountingPeriod,
  type AccountingRulePack,
  type CalculationResult,
  type ExternalIncomeInput,
  type ProviderAccountingProfile,
} from "@/lib/accounting";

export interface IncomeTabProps {
  provider: ProviderAccountingProfile;
  rulePack: AccountingRulePack | null;
  period: AccountingPeriod;
  /** Totals always come from the authoritative backend result. */
  result: CalculationResult;
  externalIncome: ExternalIncomeInput[];
  locale: string | null;
  onCreate?: (item: ExternalIncomeInput) => void;
  onImport?: (items: ExternalIncomeInput[]) => void;
}

const ALL = "__all__";

/**
 * Income tab. Presentation only — every total is read from `result`, which the
 * backend produced. This component never sums money itself.
 */
export default function IncomeTab({
  provider,
  rulePack,
  period,
  result,
  externalIncome,
  locale,
  onCreate,
  onImport,
}: IncomeTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [source, setSource] = useState(ALL);
  const [platform, setPlatform] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [currency, setCurrency] = useState(ALL);
  const [documentation, setDocumentation] = useState(ALL);
  const [onlyReview, setOnlyReview] = useState(ALL);

  const readOnly = period.status === "closed";
  const accountingCurrency = result.accountingCurrency;

  const platforms = useMemo(
    () =>
      [...new Set(externalIncome.map((i) => i.platformName).filter(Boolean))] as string[],
    [externalIncome],
  );
  const currencies = useMemo(
    () => [...new Set(externalIncome.map((i) => i.originalCurrency))],
    [externalIncome],
  );

  const reviewIds = new Set(result.reviewRequiredExternalIncomeItems);
  const excludedIds = new Set(result.excludedExternalIncomeItems);

  const visible = externalIncome.filter((item) => {
    if (item.deletedAt) return false;
    if (source !== ALL && item.incomeSourceType !== source) return false;
    if (platform !== ALL && item.platformName !== platform) return false;
    if (status !== ALL && item.paymentStatus !== status) return false;
    if (currency !== ALL && item.originalCurrency !== currency) return false;
    if (documentation !== ALL && item.documentationStatus !== documentation) return false;
    if (onlyReview === "review" && !reviewIds.has(item.id)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{INCOME_TAB_HELPER_TEXT}</p>
        <p className="text-xs text-muted-foreground">{EXTERNAL_INCOME_RESPONSIBILITY_TEXT}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          title="MyCleaner-indkomst"
          hint="Automatisk registreret via MyCleaner"
          value={formatMinor(result.myCleanerIncomeMinor, accountingCurrency, locale)}
        />
        <SummaryCard
          title="Ekstern indkomst"
          hint="Registreret manuelt af dig"
          value={formatMinor(result.externalIncomeMinor, accountingCurrency, locale)}
        />
        <SummaryCard
          title="Samlet indkomst"
          hint="Beregnet af MyCleaner"
          value={formatMinor(result.totalIncomeMinor, accountingCurrency, locale)}
        />
        <SummaryCard
          title="Manglende kontrol"
          hint="Poster der kræver kontrol"
          value={String(result.reviewRequiredExternalIncomeItems.length)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={readOnly}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Tilføj indkomst
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={readOnly}>
          <Upload className="mr-1 h-4 w-4" aria-hidden />
          Importér indkomst
        </Button>
        {readOnly && (
          <p className="w-full text-xs text-muted-foreground">
            Perioden er lukket og kan ikke redigeres.
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Kildefordeling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {result.incomeBySource.length === 0 ? (
            <p className="text-muted-foreground">Ingen medregnet indkomst i perioden endnu.</p>
          ) : (
            <ul className="space-y-1">
              {result.incomeBySource.map((row) => (
                <li
                  key={`${row.sourceType}-${row.sourceName ?? ""}`}
                  className="flex justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {row.sourceType === "mycleaner"
                      ? "MyCleaner"
                      : `${EXTERNAL_INCOME_SOURCE_LABELS[
                          row.sourceType as keyof typeof EXTERNAL_INCOME_SOURCE_LABELS
                        ] ?? row.sourceType}${row.sourceName ? ` · ${row.sourceName}` : ""}`}
                  </span>
                  <span className="shrink-0 font-medium text-foreground">
                    {formatMinor(row.amountMinor, row.currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ekstern indkomst</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Filter label="Kilde" value={source} onChange={setSource}>
              {Object.entries(EXTERNAL_INCOME_SOURCE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </Filter>
            <Filter label="Platform" value={platform} onChange={setPlatform}>
              {platforms.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </Filter>
            <Filter label="Status" value={status} onChange={setStatus}>
              {Object.entries(EXTERNAL_INCOME_PAYMENT_STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </Filter>
            <Filter label="Valuta" value={currency} onChange={setCurrency}>
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </Filter>
            <Filter label="Dokumentation" value={documentation} onChange={setDocumentation}>
              {Object.entries(EXTERNAL_INCOME_DOCUMENTATION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </Filter>
            <Filter label="Kræver kontrol" value={onlyReview} onChange={setOnlyReview}>
              <SelectItem value="review">Kun poster der kræver kontrol</SelectItem>
            </Filter>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen eksterne indkomstposter i perioden {period.periodStart} – {period.periodEnd}.
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((item) => (
                <li key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.incomeDate} ·{" "}
                        {EXTERNAL_INCOME_SOURCE_LABELS[item.incomeSourceType]}
                        {item.platformName ? ` · ${item.platformName}` : ""}
                        {item.customerReference ? ` · ${item.customerReference}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-foreground">
                        {formatMinor(item.originalAmountMinor, item.originalCurrency, locale)}
                      </p>
                      {item.originalCurrency !== accountingCurrency && (
                        <p className="text-xs text-muted-foreground">
                          {item.accountingAmountMinor != null
                            ? formatMinor(item.accountingAmountMinor, accountingCurrency, locale)
                            : "Valutakurs mangler"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline">Registreret manuelt af dig</Badge>
                    <Badge variant="outline">
                      {EXTERNAL_INCOME_PAYMENT_STATUS_LABELS[item.paymentStatus]}
                    </Badge>
                    <Badge variant="outline">
                      {EXTERNAL_INCOME_DOCUMENTATION_LABELS[item.documentationStatus]}
                    </Badge>
                    {reviewIds.has(item.id) && <Badge variant="destructive">Kræver kontrol</Badge>}
                    {excludedIds.has(item.id) && <Badge variant="secondary">Ikke medregnet</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddExternalIncomeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        provider={provider}
        rulePack={rulePack}
        accountingCurrency={accountingCurrency}
        existing={externalIncome}
        onSubmit={(item) => {
          onCreate?.(item);
          setAddOpen(false);
        }}
      />
      <ImportIncomeDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultCurrency={accountingCurrency ?? "EUR"}
        existing={externalIncome}
        onConfirm={(items) => {
          onImport?.(items);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}
