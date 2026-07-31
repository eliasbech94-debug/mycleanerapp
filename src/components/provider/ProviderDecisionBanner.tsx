/**
 * Surfaces the most recent decision about the provider's account plus their
 * appeal status. Without this, a suspended provider has no in-product way of
 * learning why — which is what MC-PROVIDER-AGREEMENT-001 §14 promises.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  APPEAL_STATUS_LABEL,
  DECISION_LABEL,
  isAppealOpen,
  listAppealsForNotices,
  listMyDecisions,
  type Appeal,
  type DecisionNotice,
} from "@/lib/appeals";

export default function ProviderDecisionBanner() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [appeal, setAppeal] = useState<Appeal | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      try {
        const list = await listMyDecisions(user.id);
        const latest = list[0] ?? null;
        if (cancelled || !latest) return;
        setNotice(latest);
        const appeals = await listAppealsForNotices([latest.id]);
        if (!cancelled) setAppeal(appeals[0] ?? null);
      } catch {
        /* banner is non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!notice) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">{DECISION_LABEL[notice.decision_type]}</p>
          <p className="mt-1 text-sm">{notice.provider_reason}</p>
          <p className="mt-2 text-sm">
            {appeal ? (
              <>
                Din klage: <strong>{APPEAL_STATUS_LABEL[appeal.status]}</strong>
                {isAppealOpen(appeal.status) ? " — en medarbejder gennemgår sagen." : ""}
              </>
            ) : notice.appealable ? (
              "Du kan klage og få afgørelsen gennemgået af en medarbejder."
            ) : null}
          </p>
          <Link
            to={`/provider/decisions/${notice.id}`}
            className="mt-3 inline-block rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {appeal ? "Se sagen" : "Se afgørelsen og klag"}
          </Link>
        </div>
      </div>
    </div>
  );
}
