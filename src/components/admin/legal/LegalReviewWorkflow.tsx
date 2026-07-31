import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Loader2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  LEGAL_STATUS_LABEL,
  REVIEW_WORKFLOW,
  isLegalStatus,
  nextStatuses,
  reviewState,
  type LegalStatus,
} from "@/lib/legal/lifecycle";
import {
  recordLegalReview,
  transitionDocumentStatus,
  type LegalDocumentRef,
} from "@/lib/legal/sections";

interface Props {
  document: LegalDocumentRef;
  onChanged?: () => void;
}

/**
 * Admin stepper for the legal review workflow
 * (Kladde → Intern gennemgang → Juridisk gennemgang → Godkendt → Publiceret)
 * plus the scheduled periodic review action.
 */
export function LegalReviewWorkflow({ document, onChanged }: Props) {
  const { t } = useTranslation("admin");
  const [busy, setBusy] = useState<string | null>(null);
  const status = document.status;
  const currentIndex = REVIEW_WORKFLOW.indexOf(status as LegalStatus);
  const review = reviewState(document.next_review_at);

  const forward = nextStatuses(status).filter(
    (s) => s !== "archived" && s !== "published" && REVIEW_WORKFLOW.indexOf(s) > currentIndex,
  );
  const backward = nextStatuses(status).filter(
    (s) => REVIEW_WORKFLOW.indexOf(s) !== -1 && REVIEW_WORKFLOW.indexOf(s) < currentIndex,
  );

  async function move(to: LegalStatus) {
    setBusy(to);
    try {
      await transitionDocumentStatus(document, to);
      toast.success(t("console.legal.review.statusChangedToast", { status: LEGAL_STATUS_LABEL[to] }));
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("console.legal.review.statusChangeFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function markReviewed() {
    setBusy("review");
    try {
      await recordLegalReview(document);
      toast.success(t("console.legal.review.reviewRecordedToast"));
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("console.legal.review.reviewRecordFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("console.legal.review.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="flex flex-wrap items-center gap-2" aria-label={t("console.legal.review.ariaLabel")}>
          {REVIEW_WORKFLOW.map((step, index) => {
            const done = currentIndex > index;
            const active = currentIndex === index;
            return (
              <li key={step} className="flex items-center gap-2">
                <span
                  aria-current={active ? "step" : undefined}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : done
                        ? "border-transparent bg-muted text-muted-foreground"
                        : "border-dashed border-border text-muted-foreground",
                  ].join(" ")}
                >
                  {done && <Check className="h-3 w-3" aria-hidden="true" />}
                  {LEGAL_STATUS_LABEL[step]}
                </span>
                {index < REVIEW_WORKFLOW.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("console.legal.review.currentStatus")}</span>
          <Badge variant="secondary">
            {isLegalStatus(status) ? LEGAL_STATUS_LABEL[status] : status}
          </Badge>
        </div>

        {(forward.length > 0 || backward.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {forward.map((s) => (
              <Button key={s} size="sm" disabled={busy !== null} onClick={() => move(s)}>
                {busy === s && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t("console.legal.review.sendTo", { status: LEGAL_STATUS_LABEL[s].toLowerCase() })}
              </Button>
            ))}
            {backward.map((s) => (
              <Button key={s} size="sm" variant="outline" disabled={busy !== null} onClick={() => move(s)}>
                {busy === s && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t("console.legal.review.backTo", { status: LEGAL_STATUS_LABEL[s].toLowerCase() })}
              </Button>
            ))}
          </div>
        )}

        <div className="rounded-lg border bg-muted/40 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("console.legal.review.scheduledReview")}
          </div>
          <p className="mt-1 text-muted-foreground">
            {review.dueAt
              ? `${t("console.legal.review.nextReview", { date: review.dueAt.toLocaleDateString("da-DK") })}${
                  review.isOverdue ? ` ${t("console.legal.review.overdue")}` : review.isDueSoon ? ` ${t("console.legal.review.dueSoon")}` : ""
                }`
              : t("console.legal.review.noReviewScheduled")}
            {document.review_interval_months ? ` ${t("console.legal.review.intervalMonths", { months: document.review_interval_months })}` : ""}
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={markReviewed}
          >
            {busy === "review" && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t("console.legal.review.markReviewed")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default LegalReviewWorkflow;
