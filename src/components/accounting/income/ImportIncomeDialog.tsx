import { useState } from "react";
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

const COLUMN_LABELS: Record<ImportColumnKey, string> = {
  incomeDate: "Dato (ÅÅÅÅ-MM-DD)",
  description: "Beskrivelse",
  amount: "Beløb",
  currency: "Valuta",
  platformName: "Platform",
  customerReference: "Kundereference",
  invoiceNumber: "Fakturanummer",
  paymentStatus: "Betalingsstatus",
  paymentMethod: "Betalingsmetode",
};

const NONE = "__none__";

/** Upload → match kolonner → preview → bekræft. Poster gemmes som review_required. */
export default function ImportIncomeDialog({
  open,
  onOpenChange,
  defaultCurrency,
  existing,
  onConfirm,
}: ImportIncomeDialogProps) {
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
          <DialogTitle>Importér indkomst</DialogTitle>
          <DialogDescription>
            Importerede poster gemmes til kontrol og medregnes først, når du har godkendt dem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">CSV-fil eller payout-oversigt</Label>
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
            <Label className="text-xs">Kilde</Label>
            <Select
              value={sourceType}
              onValueChange={(v) => setSourceType(v as ExternalIncomeSourceType)}
            >
              <SelectTrigger aria-label="Kilde for import">
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
              <p className="text-sm font-medium text-foreground">Match kolonner</p>
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
                      <SelectItem value={NONE}>Ikke valgt</SelectItem>
                      {csv.headers.map((header, index) => (
                        <SelectItem key={`${header}-${index}`} value={String(index)}>
                          {header || `Kolonne ${index + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={runPreview}>
                Vis preview
              </Button>
            </div>
          )}

          {preview && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                {preview.drafts.length} post(er) klar til kontrol
              </p>
              {preview.issues.length > 0 && (
                <ul className="space-y-1 text-xs text-destructive">
                  {preview.issues.slice(0, 10).map((issue) => (
                    <li key={`${issue.rowIndex}-${issue.code}`}>
                      Række {issue.rowIndex + 1}: {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Alle importerede poster markeres som “kræver kontrol”.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button
            disabled={!preview || preview.drafts.length === 0}
            onClick={() => preview && onConfirm(preview.drafts)}
          >
            Bekræft import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
