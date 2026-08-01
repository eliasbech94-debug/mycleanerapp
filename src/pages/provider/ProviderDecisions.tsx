/**
 * /provider/decisions[/:noticeId]
 *
 * The provider's own view of decisions made about their account, and the place
 * where they exercise their right to a human review (appeal).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FileText, Loader2, Paperclip, ShieldCheck, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  APPEAL_RESPONSE_DAYS,
  APPEAL_STATUS_LABEL,
  DECISION_LABEL,
  WITHHELD_LABEL,
  appealErrorMessage,
  getAppealEvidenceUrl,
  isAppealOpen,
  listAppealAttachments,
  listAppealEvents,
  listAppealsForNotices,
  listMyDecisions,
  respondToAppeal,
  submitAppeal,
  uploadAppealEvidence,
  type Appeal,
  type AppealAttachment,
  type AppealEvent,
  type DecisionNotice,
} from "@/lib/appeals";
import { useCountryPath } from "@/lib/countryPath";

const dtf = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function StatusBadge({ status }: { status: Appeal["status"] }) {
  const tone =
    status === "changed"
      ? "bg-emerald-100 text-emerald-900"
      : status === "upheld" || status === "withdrawn"
        ? "bg-muted text-muted-foreground"
        : "bg-amber-100 text-amber-900";
  return <Badge className={`${tone} border-0`}>{APPEAL_STATUS_LABEL[status]}</Badge>;
}

function AppealPanel({
  appeal,
  onChanged,
}: {
  appeal: Appeal;
  onChanged: () => void;
}) {
  const { t } = useTranslation("provider");
  const [events, setEvents] = useState<AppealEvent[]>([]);
  const [attachments, setAttachments] = useState<AppealAttachment[]>([]);
  const [followup, setFollowup] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [ev, att] = await Promise.all([
      listAppealEvents(appeal.id).catch(() => [] as AppealEvent[]),
      listAppealAttachments(appeal.id).catch(() => [] as AppealAttachment[]),
    ]);
    setEvents(ev);
    setAttachments(att);
  }, [appeal.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = isAppealOpen(appeal.status);

  async function act(action: "add_information" | "withdraw") {
    setBusy(true);
    try {
      await respondToAppeal(appeal.id, action, action === "add_information" ? followup : undefined);
      setFollowup("");
      toast({
        title: action === "withdraw" ? t("surfaces.decisions.toastAppealWithdrawn") : t("surfaces.decisions.toastInfoSent"),
      });
      await refresh();
      onChanged();
    } catch (e) {
      toast({ title: t("surfaces.decisions.toastCouldNotComplete"), description: appealErrorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File) {
    setBusy(true);
    try {
      await uploadAppealEvidence(appeal.id, file);
      toast({ title: t("surfaces.decisions.toastDocUploaded") });
      await refresh();
    } catch (e) {
      toast({ title: t("surfaces.decisions.toastUploadFailed"), description: appealErrorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function openAttachment(id: string) {
    try {
      const url = await getAppealEvidenceUrl(id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: t("surfaces.decisions.toastCouldNotOpenDoc"), description: appealErrorMessage(e), variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{t("surfaces.decisions.yourAppeal")}</CardTitle>
        <StatusBadge status={appeal.status} />
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("surfaces.decisions.yourExplanation")}</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{appeal.provider_statement}</p>
        </div>

        {appeal.information_request && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="font-semibold">{t("surfaces.decisions.infoRequestTitle")}</div>
            <p className="mt-1 whitespace-pre-wrap">{appeal.information_request}</p>
          </div>
        )}

        {appeal.reviewer_reason && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="font-semibold">{t("surfaces.decisions.appealDecisionTitle")}</div>
            <p className="mt-1 whitespace-pre-wrap">{appeal.reviewer_reason}</p>
            {appeal.decided_at && (
              <p className="mt-2 text-xs text-muted-foreground">{t("surfaces.decisions.decidedOn", { date: dtf.format(new Date(appeal.decided_at)) })}</p>
            )}
          </div>
        )}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("surfaces.decisions.documentation")}</div>
          {attachments.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("surfaces.decisions.noDocsUploaded")}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {attachments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openAttachment(a.id)}
                    className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
                  >
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.file_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>{t("surfaces.decisions.uploadDocsLabel")}</span>
              <input
                type="file"
                className="sr-only"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onUpload(f);
                }}
              />
            </label>
          )}
        </div>

        {open && (
          <div className="space-y-3 border-t pt-4">
            <label htmlFor="appeal-followup" className="text-sm font-medium">
              {t("surfaces.decisions.addInfoLabel")}
            </label>
            <Textarea
              id="appeal-followup"
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              rows={4}
              placeholder={t("surfaces.decisions.addInfoPlaceholder")}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || followup.trim().length === 0} onClick={() => act("add_information")}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("surfaces.decisions.sendInfo")}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => act("withdraw")}>
                {t("surfaces.decisions.withdrawAppeal")}
              </Button>
            </div>
          </div>
        )}

        {events.length > 0 && (
          <div className="border-t pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("surfaces.decisions.caseHistory")}</div>
            <ol className="mt-2 space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    {ev.event_type.replace(/_/g, " ")}
                    {ev.to_status ? ` → ${APPEAL_STATUS_LABEL[ev.to_status as Appeal["status"]] ?? ev.to_status}` : ""}
                  </span>
                  <span className="text-muted-foreground">{dtf.format(new Date(ev.created_at))}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoticeCard({
  notice,
  appeal,
  onChanged,
}: {
  notice: DecisionNotice;
  appeal: Appeal | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation("provider");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const canAppeal = notice.appealable && (!appeal || !isAppealOpen(appeal.status));

  async function send() {
    setBusy(true);
    try {
      await submitAppeal(notice.id, statement);
      setStatement("");
      toast({
        title: t("surfaces.decisions.toastAppealReceived"),
        description: t("surfaces.decisions.toastAppealReceivedDescription", { days: APPEAL_RESPONSE_DAYS }),
      });
      onChanged();
    } catch (e) {
      toast({ title: t("surfaces.decisions.toastAppealNotSent"), description: appealErrorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <CardTitle className="text-lg">{DECISION_LABEL[notice.decision_type]}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("surfaces.decisions.effectiveFrom", { date: dtf.format(new Date(notice.effective_at)) })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("surfaces.decisions.reason")}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{notice.provider_reason}</p>
            {notice.reason_withheld && notice.reason_withheld_code && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("surfaces.decisions.reasonRestricted", { label: WITHHELD_LABEL[notice.reason_withheld_code] })}
              </p>
            )}
          </div>

          {notice.rules_applied.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("surfaces.decisions.rulesApplied")}
              </div>
              <ul className="mt-1 list-inside list-disc text-sm">
                {notice.rules_applied.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              {notice.human_reviewed
                ? t("surfaces.decisions.humanReviewed")
                : t("surfaces.decisions.humanReviewPending")}{" "}
              {notice.ai_assisted
                ? t("surfaces.decisions.aiAssisted")
                : t("surfaces.decisions.noAiUsed")}
            </p>
          </div>
        </CardContent>
      </Card>

      {appeal && <AppealPanel appeal={appeal} onChanged={onChanged} />}

      {canAppeal && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("surfaces.decisions.appealDecisionCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("surfaces.decisions.appealDecisionCardDescription", { days: APPEAL_RESPONSE_DAYS })}
            </p>
            <label htmlFor="appeal-statement" className="sr-only">
              {t("surfaces.decisions.yourExplanationSrOnly")}
            </label>
            <Textarea
              id="appeal-statement"
              rows={6}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder={t("surfaces.decisions.appealStatementPlaceholder")}
            />
            <Button disabled={busy || statement.trim().length < 20} onClick={send}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("surfaces.decisions.sendAppeal")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!notice.appealable && (
        <p className="text-sm text-muted-foreground">
          {t("surfaces.decisions.notAppealable")}
        </p>
      )}
    </div>
  );
}

export default function ProviderDecisions() {
  const { t } = useTranslation("provider");
  const { user } = useAuth();
  const { noticeId } = useParams();
  const navigate = useNavigate();
  const localize = useCountryPath();
  const [notices, setNotices] = useState<DecisionNotice[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await listMyDecisions(user.id);
      setNotices(list);
      setAppeals(await listAppealsForNotices(list.map((n) => n.id)));
    } catch {
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const appealByNotice = useMemo(() => {
    const m = new Map<string, Appeal>();
    for (const a of appeals) if (!m.has(a.notice_id)) m.set(a.notice_id, a);
    return m;
  }, [appeals]);

  const selected = noticeId ? notices.find((n) => n.id === noticeId) ?? null : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <BackButton />
      <h1 className="mt-4 font-display text-3xl">{t("surfaces.decisions.pageTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("surfaces.decisions.pageDescription")}
      </p>

      <div className="mt-6 space-y-4">
        {loading ? (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : notices.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
              <FileText className="h-5 w-5" aria-hidden="true" />
              {t("surfaces.decisions.noDecisions")}
            </CardContent>
          </Card>
        ) : selected ? (
          <>
            <Button variant="ghost" className="px-0" onClick={() => navigate(localize("/provider/decisions"))}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("surfaces.decisions.allDecisions")}
            </Button>
            <NoticeCard notice={selected} appeal={appealByNotice.get(selected.id) ?? null} onChanged={load} />
          </>
        ) : (
          notices.map((n) => {
            const a = appealByNotice.get(n.id) ?? null;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => navigate(localize(`/provider/decisions/${n.id}`))}
                className="w-full rounded-xl border p-5 text-left transition hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{DECISION_LABEL[n.decision_type]}</span>
                  {a ? <StatusBadge status={a.status} /> : <Badge variant="outline">{t("surfaces.decisions.noAppeal")}</Badge>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{n.provider_reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">{dtf.format(new Date(n.effective_at))}</p>
              </button>
            );
          })
        )}
      </div>
    </main>
  );
}
