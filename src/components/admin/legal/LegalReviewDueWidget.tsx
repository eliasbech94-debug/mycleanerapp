import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchDocumentsDueForReview, type ReviewDueRow } from "@/lib/legal/sections";

interface Props {
  withinDays?: number;
  onSelect?: (documentId: string) => void;
}

/** Dashboard widget listing published documents whose legal review is due. */
export function LegalReviewDueWidget({ withinDays = 30, onSelect }: Props) {
  const [rows, setRows] = useState<ReviewDueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDocumentsDueForReview(withinDays)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Kunne ikke hente gennemgangsliste");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [withinDays]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Gennemgang forfalder
        </CardTitle>
        <CardDescription>
          Publicerede dokumenter der skal gennemgås inden for {withinDays} dage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Henter…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen dokumenter afventer gennemgang.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const overdue = row.days_until < 0;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.doc_uid ?? row.slug} · v{row.version} · {row.country_code}/{row.language}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={overdue ? "destructive" : "secondary"} className="gap-1">
                      {overdue && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                      {overdue ? `${Math.abs(row.days_until)} dage over` : `om ${row.days_until} dage`}
                    </Badge>
                    {onSelect && (
                      <Button size="sm" variant="outline" onClick={() => onSelect(row.id)}>
                        Åbn
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default LegalReviewDueWidget;
