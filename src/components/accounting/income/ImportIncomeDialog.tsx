import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXTERNAL_INCOME_SOURCE_LABELS,
  buildImportPreview,
  parseCsv,
  type ExternalIncomeInput,
  type ExternalIncomeSourceType,
  type ImportColumnKey,
  type ImportColumnMapping,
  type ImportPreview,
  type ParsedCsv,
} from "@/lib/accounting";

export interface ImportIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: string;
  existing: ExternalIncomeInput[];
  onConfirm: (items: ExternalIncomeInput[]) => void;
}

const NONE = "__none__";

/** Upload → match kolonner → preview → bekræft. Poster gemmes som review_required. */
export default function ImportIncomeDialog({
  open,
  onOpenChange,
  defaultCurrency,
  existing,
  onConfirm,
}: ImportIncomeDialogProps) {
  const { t } = useTranslation("finance");
  const COLUMN_LABELS: Record<ImportColumnKey, string> = {
    incomeDate: t("ui.income.import.columnLabels.incomeDate"),
    description: t("ui.income.import.columnLabels.description"),
    amount: t("ui.income.import.columnLabels.amount"),
    currency: t("ui.income.import.columnLabels.currency"),
    platformName: t("ui.income.import.columnLabels.platformName"),
    customerReference: t("ui.income.import.columnLabels.customerReference"),
    invoiceNumber: t("ui.income.import.columnLabels.invoiceNumber"),
    paymentStatus: t("ui.income.import.columnLabels.paymentStatus"),
    paymentMethod: t("ui.income.import.columnLabels.paymentMethod"),
  };
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [sourceType, setSourceType] = useState<ExternalIncomeSourceType>("other_platform");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsv(parsed);
    setPreview(null);
    const guess: ImportColumnMapping = {};
    parsed.headers.forEach((header, index) => {
      const h = header.toLowerCase();
      if (/dato|date/.test(h)) guess.incomeDate ??= index;
      else if (/beskriv|description|text/.test(h)) guess.description ??= index;
      else if (/beløb|belob|amount|net/.test(h)) guess.amount ??= index;
      else if (/valuta|currency/.test(h)) guess.currency ??= index;
      else if (/platform/.test(h)) guess.platformName ??= index;
      else if (/kunde|customer/.test(h)) guess.customerReference ??= index;
      else if (/faktura|invoice/.test(h)) guess.invoiceNumber ??= index;
    });
    setMapping(guess);
  }

  function runPreview() {
    if (!csv) return;
    setPreview(
      buildImportPreview({
        csv,
        mapping,
        incomeSourceType: sourceType,
        defaultCurrency,
        existing,
        importedFrom: "csv",
      }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ui.income.import.title")}</DialogTitle>
          <DialogDescription>{t("ui.income.import.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("ui.income.import.fileLabel")}</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("ui.income.import.sourceLabel")}</Label>
            <Select
              value={sourceType}
              onValueChange={(v) => setSourceType(v as ExternalIncomeSourceType)}
            >
              <SelectTrigger aria-label={t("ui.income.import.sourceAriaLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXTERNAL_INCOME_SOURCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {csv && csv.headers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{t("ui.income.import.matchColumns")}</p>
              {(Object.keys(COLUMN_LABELS) as ImportColumnKey[]).map((key) => (
                <div key={key} className="grid grid-cols-2 items-center gap-2">
                  <Label className="text-xs">{COLUMN_LABELS[key]}</Label>
                  <Select
                    value={mapping[key] != null ? String(mapping[key]) : NONE}
                    onValueChange={(v) =>
                      setMapping((prev) => ({
                        ...prev,
                        [key]: v === NONE ? undefined : Number(v),
                      }))
                    }
                  >
                    <SelectTrigger aria-label={COLUMN_LABELS[key]}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("ui.income.import.notSelected")}</SelectItem>
                      {csv.headers.map((header, index) => (
                        <SelectItem key={`${header}-${index}`} value={String(index)}>
                          {header || t("ui.income.import.columnFallback", { index: index + 1 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={runPreview}>
                {t("ui.income.import.showPreview")}
              </Button>
            </div>
          )}

          {preview && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                {t("ui.income.import.entriesReady", { count: preview.drafts.length })}
              </p>
              {preview.issues.length > 0 && (
                <ul className="space-y-1 text-xs text-destructive">
                  {preview.issues.slice(0, 10).map((issue) => (
                    <li key={`${issue.rowIndex}-${issue.code}`}>
                      {t("ui.income.import.rowIssue", { row: issue.rowIndex + 1, message: issue.message })}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {t("ui.income.import.allImportedNote")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("ui.income.import.cancel")}
          </Button>
          <Button
            disabled={!preview || preview.drafts.length === 0}
            onClick={() => preview && onConfirm(preview.drafts)}
          >
            {t("ui.income.import.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
