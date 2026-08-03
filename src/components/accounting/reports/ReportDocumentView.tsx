import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ReportDocument, ReportSection } from "@/lib/accounting/monthlyReport";
import mycleanerLogo from "@/assets/mycleaner-logo.png";

/**
 * Renders the exact same document model that the PDF generator consumes, so
 * the on-screen report and the generated PDF can never drift apart.
 */
export default function ReportDocumentView({ document }: { document: ReportDocument }) {
  const { t } = useTranslation("finance");
  return (
    <article className="space-y-4" aria-label={`${document.title} — ${document.periodLabel}`}>
      <header className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <img src={mycleanerLogo} alt="MyCleaner" className="h-8 w-auto" />
          <span className="text-lg font-semibold text-foreground">{document.brandName}</span>
          {document.provisional && (
            <Badge variant="outline">{t("ui.reports.document.provisionalBadge")}</Badge>
          )}
        </div>
        <h2 className="mt-3 text-xl font-semibold text-foreground">{document.title}</h2>
        <p className="text-sm text-muted-foreground">{document.subtitle}</p>
        <p className="mt-2 text-sm text-foreground">{document.periodLabel}</p>
        <p className="text-sm text-muted-foreground">
          {document.providerName} · {document.myCleanerId} · {t("ui.reports.document.generatedLabel", { date: document.generatedAtLabel })}
        </p>
      </header>

      {document.sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("ui.reports.document.importantTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {document.disclaimer.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <Separator />
          <p className="text-xs">{document.footer}</p>
        </CardContent>
      </Card>
    </article>
  );
}

function SectionCard({ section }: { section: ReportSection }) {
  const { t } = useTranslation("finance");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {section.note && <p className="text-muted-foreground">{section.note}</p>}

        {(section.kind === "cards" || section.kind === "keyvalue") && (
          <dl
            className={
              section.kind === "cards"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "grid grid-cols-1 gap-2 sm:grid-cols-2"
            }
          >
            {section.cards.map((card) => (
              <div key={card.label} className="rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{card.label}</dt>
                <dd className="break-words font-medium text-foreground">{card.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {section.kind === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr>
                  {section.table.columns.map((column) => (
                    <th key={column} className="border-b border-border py-2 pr-3 font-medium text-muted-foreground">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.length === 0 ? (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={section.table.columns.length}>
                      {t("ui.reports.document.noEntriesInPeriod")}
                    </td>
                  </tr>
                ) : (
                  section.table.rows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border-b border-border/60 py-2 pr-3 text-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {section.table.subtotals && section.table.subtotals.length > 0 && (
              <ul className="mt-3 space-y-1">
                {section.table.subtotals.map((total) => (
                  <li key={total.label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{total.label}</span>
                    <span className="font-medium text-foreground">{total.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {section.kind === "list" && (
          <ul className="list-disc space-y-1 pl-5 text-foreground">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

        {section.kind === "text" && (
          <div className="space-y-2 text-muted-foreground">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
