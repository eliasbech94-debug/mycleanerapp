/**
 * /admin/appeals — human review queue for provider appeals.
 *
 * Support may triage (under review / request information); only admins can
 * close an appeal with a final outcome. Every transition is logged.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  APPEAL_STATUS_LABEL,
  DECISION_LABEL,
  OPEN_APPEAL_STATUSES,
  appealErrorMessage,
  getAppealEvidenceUrl,
  isAppealOpen,
  listAppealAttachments,
  staffTransitionAppeal,
  type Appeal,
  type AppealAttachment,
  type AppealStatus,
  type DecisionNotice,
} from "@/lib/appeals";

const dtf = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Row = Appeal & { notice: DecisionNotice | null };

function Filters({
  value,
  onChange,
}: {
  value: "open" | "closed";
  onChange: (v: "open" | "closed") => void;
}) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="Filtrér klagesager">
      {(["open", "closed"] as const).map((v) => (
        <Button
          key={v}
          role="tab"
          aria-selected={value === v}
          variant={value === v ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(v)}
        >
          {v === "open" ? "Åbne sager" : "Afsluttede"}
        </Button>
      ))}
    </div>
  );
}

function AppealRow({ row, canDecide, onDone }: { row: Row; canDecide: boolean; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<AppealStatus | null>(null);
  const [attachments, setAttachments] = useState<AppealAttachment[]>([]);

  useEffect(() => {
    listAppealAttachments(row.id).then(setAttachments).catch(() => setAttachments([]));
  }, [row.id]);

  async function transition(to: Exclude<AppealStatus, "submitted" | "withdrawn">) {
    setBusy(to);
    try {
      await staffTransitionAppeal(row.id, to, reason);
      toast({ title: `Sagen er opdateret: ${APPEAL_STATUS_LABEL[to]}` });
      setReason("");
      onDone();
    } catch (e) {
      toast({ title: "Handlingen fejlede", description: appealErrorMessage(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function openAttachment(id: string) {
    try {
      const url = await getAppealEvidenceUrl(id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Kunne ikke åbne dokumentet", description: appealErrorMessage(e), variant: "destructive" });
    }
  }

  const open = isAppealOpen(row.status);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          {row.notice ? DECISION_LABEL[row.notice.decision_type] : "Afgørelse"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{APPEAL_STATUS_LABEL[row.status]}</Badge>
          <span className="text-xs text-muted-foreground">{dtf.format(new Date(row.submitted_at))}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">Provider-ID: {row.provider_user_id}</p>

        {row.notice && (
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Oprindelig begrundelse
            </div>
            <p className="mt-1 whitespace-pre-wrap">{row.notice.provider_reason}</p>
            {row.notice.ai_assisted && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Automatisk beslutningsstøtte anvendt — kræver selvstændig menneskelig vurdering.
              </p>
            )}
          </div>
        )}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Providerens forklaring
          </div>
          <p className="mt-1 whitespace-pre-wrap">{row.provider_statement}</p>
        </div>

        {row.provider_followup && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Supplerende oplysninger
            </div>
            <p className="mt-1 whitespace-pre-wrap">{row.provider_followup}</p>
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="space-y-1">
            {attachments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 underline underline-offset-4"
                  onClick={() => openAttachment(a.id)}
                >
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  {a.file_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {row.reviewer_reason && (
          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Afgørelse</div>
            <p className="mt-1 whitespace-pre-wrap">{row.reviewer_reason}</p>
          </div>
        )}

        {open && (
          <div className="space-y-3 border-t pt-4">
            <label htmlFor={`reason-${row.id}`} className="text-sm font-medium">
              Begrundelse (vises for provideren)
            </label>
            <Textarea
              id={`reason-${row.id}`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mindst 10 tegn."
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => transition("under_review")}>
                Tag under behandling
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || reason.trim().length < 10}
                onClick={() => transition("information_requested")}
              >
                Bed om oplysninger
              </Button>
              {canDecide && (
                <>
                  <Button
                    size="sm"
                    disabled={busy !== null || reason.trim().length < 10}
                    onClick={() => transition("changed")}
                  >
                    {busy === "changed" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    Giv medhold — afgørelse ændres
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null || reason.trim().length < 10}
                    onClick={() => transition("upheld")}
                  >
                    {busy === "upheld" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    Fasthold afgørelsen
                  </Button>
                </>
              )}
            </div>
            {!canDecide && (
              <p className="text-xs text-muted-foreground">
                Kun en administrator kan træffe den endelige afgørelse.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAppeals() {
  const { roles } = useUserRoles();
  const canDecide = roles.some((r) => r === "admin" || r === "super_admin");
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("provider_appeals")
      .select("*")
      .order("submitted_at", { ascending: true })
      .limit(200);
    const appeals = (data ?? []) as unknown as Appeal[];
    const noticeIds = [...new Set(appeals.map((a) => a.notice_id))];
    const { data: notices } = noticeIds.length
      ? await supabase.from("provider_decision_notices").select("*").in("id", noticeIds)
      : { data: [] };
    const byId = new Map(
      ((notices ?? []) as unknown as DecisionNotice[]).map((n) => [n.id, n] as const),
    );
    setRows(appeals.map((a) => ({ ...a, notice: byId.get(a.notice_id) ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter((r) =>
        filter === "open"
          ? OPEN_APPEAL_STATUSES.includes(r.status)
          : !OPEN_APPEAL_STATUSES.includes(r.status),
      ),
    [rows, filter],
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="font-display text-3xl">Klagesager</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Menneskelig gennemgang af afgørelser om providerkonti. Ældste sag først.
      </p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Filters value={filter} onChange={setFilter} />
        <span className="text-sm text-muted-foreground">{visible.length} sager</span>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Ingen sager i denne visning.
            </CardContent>
          </Card>
        ) : (
          visible.map((r) => <AppealRow key={r.id} row={r} canDecide={canDecide} onDone={load} />)
        )}
      </div>
    </main>
  );
}
