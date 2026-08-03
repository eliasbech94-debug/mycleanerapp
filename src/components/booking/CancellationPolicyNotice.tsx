/**
 * Shows the concrete cancellation ladder for one booking, including the exact
 * local instants at which free cancellation expires and the 100 % cancellation
 * fee begins. Reads the canonical policy from `src/lib/cancellationPolicy.ts` —
 * never hardcode the numbers or the wording thresholds here.
 *
 * All copy comes from the `common` namespace (`cancellation.notice.*`) and the
 * date/time formatting follows the active UI language.
 *
 * `policyVersion` comes from the booking's frozen
 * `cancellation_policy_snapshot`; omitting it means "a booking made now", which
 * uses the current policy.
 */
import { useTranslation } from "react-i18next";
import {
  cancellationCutoffs,
  policyAt,
  policyForVersion,
  type CancellationPolicy,
} from "@/lib/cancellationPolicy";

export function CancellationPolicyNotice({
  serviceStart,
  policyVersion,
  className,
}: {
  serviceStart: Date | string | number;
  policyVersion?: string | null;
  className?: string;
}) {
  const { t, i18n } = useTranslation("common");

  // An existing booking is always shown with the version frozen on it; a
  // booking that does not exist yet uses the policy in force right now.
  const policy: CancellationPolicy = policyVersion
    ? policyForVersion(policyVersion)
    : policyAt(new Date());

  const start = new Date(serviceStart);
  if (Number.isNaN(start.getTime())) return null;
  const cutoffs = cancellationCutoffs(start, policy);
  if (!cutoffs) return null;

  const dtf = new Intl.DateTimeFormat(i18n.language || "en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const full = policy.tiers.find((x) => x.key === "full") ?? policy.tiers[0];
  const partial = policy.tiers.find((x) => x.key === "partial") ?? policy.tiers[1];

  const freeUntil = dtf.format(cutoffs.freeUntil);
  const feeFrom = dtf.format(cutoffs.fullFeeFrom);

  return (
    <section className={className} aria-labelledby="cancellation-policy-heading">
      <h2 id="cancellation-policy-heading" className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
        {t("cancellation.notice.heading")}
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{t("cancellation.notice.free")}</span>
          <span className="opacity-70">{t("cancellation.notice.freeWhen", { time: freeUntil })}</span>
        </li>
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">
            {t("cancellation.notice.partial", { percent: partial.refundPercent })}
          </span>
          <span className="opacity-70">
            {t("cancellation.notice.partialWhen", { from: freeUntil, to: feeFrom })}
          </span>
        </li>
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{t("cancellation.notice.none")}</span>
          <span className="opacity-70">{t("cancellation.notice.noneWhen", { time: feeFrom })}</span>
        </li>
      </ul>
      <p className="mt-3 text-xs opacity-60">
        {t("cancellation.notice.detail", {
          start: dtf.format(start),
          freeUntil,
          feeFrom,
          fullHours: full.minHoursBeforeStart,
          partialHours: partial.minHoursBeforeStart,
          complaintHours: policy.complaintWindowHours,
        })}
      </p>
    </section>
  );
}
