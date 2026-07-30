import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, Loader2 } from "lucide-react";
import ReportDocumentView from "./ReportDocumentView";
import { formatMinor } from "@/lib/accounting";
import {
  monthLabel,
  type MonthlyReportRecord,
  type MonthlyReportStatus,
  type ReportDocument,
} from "@/lib/accounting/monthlyReport";

export interface MonthlyReportListItem {
  record: MonthlyReportRecord;
  /** Rendered document for on-screen preview. Optional — the PDF is authoritative. */
  document?: ReportDocument | null;
}

export interface MonthlyReportsSectionProps {
  reports: MonthlyReportListItem[];
  loading?: boolean;
  unavailableReason?: string | null;
  locale?: string | null;
  onDownload?: (record: MonthlyReportRecord) => void;
  downloadingId?: string | null;
  /** Historical versions are hidden behind a toggle. */
  showSuperseded?: boolean;
  onToggleSuperseded?: (next: boolean) => void;
}

const STATUS_LABELS: Record<MonthlyReportStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  scheduled: { label: "Planlagt", variant: "outline" },
  generating: { label: "Genereres", variant: "secondary" },
  ready: { label: "Klar", variant: "default" },
  ready_with_warnings: { label: "Klar — kræver kontrol", variant: "secondary" },
  failed: { label: "Kunne ikke genereres", variant: "destructive" },
  superseded: { label: "Erstattet", variant: "outline" },
};

export default function MonthlyReportsSection({
  reports,
  loading = false,
  unavailableReason = null,
  locale = null,
  onDownload,
  downloadingId = null,
  showSuperseded = false,
  onToggleSuperseded,
}: MonthlyReportsSectionProps) {
  const [preview, setPreview] = useState<ReportDocument | null>(null);

  const visible = showSuperseded ? reports : reports.filter((item) => item.record.isCurrentVersion);
  const hasSuperseded = reports.some((item) => !item.record.isCurrentVersion);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Månedlige regnskabsrapporter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            MyCleaner samler automatisk din måned i én rapport den 1. i den efterfølgende måned.
            Rapporten indeholder indkomst, gebyrer, udgifter, kørsel og poster, der kræver kontrol.
          </p>
          <p>
            Rapporten er en foreløbig oversigt — ikke en officiel skatte- eller momsindberetning.
          </p>
        </CardContent>
      </Card>

      {unavailableReason && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rapporter kan ikke hentes lige nu</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{unavailableReason}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Henter rapporter…</span>
        </div>
      ) : visible.length === 0 && !unavailableReason ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Der er endnu ingen månedsrapporter. Den første rapport oprettes automatisk, når din
            første måned med aktivitet er afsluttet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map(({ record, document }) => {
            const status = STATUS_LABELS[record.status];
            return (
              <li key={record.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-foreground">
                          {monthLabel(record.reportYear, record.reportMonth)}
                        </h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {record.reportKind === "provisional" && (
                          <Badge variant="outline">Foreløbig</Badge>
                        )}
                        {record.reportVersion > 1 && (
                          <Badge variant="outline">Version {record.reportVersion}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {record.periodStart} – {record.periodEnd}
                        {record.jurisdictionCode ? ` · ${record.jurisdictionCode}` : ""}
                        {record.rulePackVersion ? ` · regelpakke ${record.rulePackVersion}` : ""}
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">Samlet indkomst: </span>
                        <span className="font-medium text-foreground">
                          {formatMinor(record.totalIncomeMinor, record.accountingCurrency, locale)}
                        </span>
                        <span className="text-muted-foreground"> · Foreløbigt resultat: </span>
                        <span className="font-medium text-foreground">
                          {formatMinor(record.preliminaryResultMinor, record.accountingCurrency, locale)}
                        </span>
                      </p>
                      {record.reviewRequiredCount > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {record.reviewRequiredCount} post(er) kræver din kontrol.
                        </p>
                      )}
                      {record.status === "failed" && record.generationErrorMessage && (
                        <p className="mt-1 text-sm text-destructive">{record.generationErrorMessage}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {document && (
                        <Button variant="outline" size="sm" onClick={() => setPreview(document)}>
                          <FileText className="mr-2 h-4 w-4" aria-hidden />
                          Se rapport
                        </Button>
                      )}
                      {onDownload && record.pdfStoragePath && (
                        <Button
                          size="sm"
                          onClick={() => onDownload(record)}
                          disabled={downloadingId === record.id}
                          aria-label={`Download rapport for ${monthLabel(record.reportYear, record.reportMonth)}`}
                        >
                          {downloadingId === record.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Download className="mr-2 h-4 w-4" aria-hidden />
                          )}
                          Download PDF
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {hasSuperseded && onToggleSuperseded && (
        <Button variant="ghost" size="sm" onClick={() => onToggleSuperseded(!showSuperseded)}>
          {showSuperseded ? "Skjul tidligere versioner" : "Vis tidligere versioner"}
        </Button>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.title ?? "Rapport"}</DialogTitle>
          </DialogHeader>
          {preview && <ReportDocumentView document={preview} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
