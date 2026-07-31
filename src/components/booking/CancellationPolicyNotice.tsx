/**
 * Shows the concrete cancellation ladder for one booking, including the exact
 * local instants at which free cancellation expires and the 100 % cancellation
 * fee begins. Reads the canonical policy from `src/lib/cancellationPolicy.ts` —
 * never hardcode the numbers or the wording thresholds here.
 *
 * `policyVersion` comes from the booking's frozen
 * `cancellation_policy_snapshot`; omitting it means "a booking made now", which
 * uses the current policy.
 */
import {
  cancellationCutoffs,
  policyAt,
  policyForVersion,
  type CancellationPolicy,
} from "@/lib/cancellationPolicy";

const dtf = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function CancellationPolicyNotice({
  serviceStart,
  policyVersion,
  className,
}: {
  serviceStart: Date | string | number;
  policyVersion?: string | null;
  className?: string;
}) {
  // An existing booking is always shown with the version frozen on it; a
  // booking that does not exist yet uses the policy in force right now.
  const policy: CancellationPolicy = policyVersion
    ? policyForVersion(policyVersion)
    : policyAt(new Date());

  const start = new Date(serviceStart);
  if (Number.isNaN(start.getTime())) return null;
  const cutoffs = cancellationCutoffs(start, policy);
  if (!cutoffs) return null;

  const full = policy.tiers.find((t) => t.key === "full") ?? policy.tiers[0];
  const partial = policy.tiers.find((t) => t.key === "partial") ?? policy.tiers[1];

  return (
    <section className={className} aria-labelledby="cancellation-policy-heading">
      <h2 id="cancellation-policy-heading" className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
        Afbestilling
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">Gratis aflysning — 100 % refusion</span>
          <span className="opacity-70">
            hvis du aflyser før {dtf.format(cutoffs.freeUntil)}
          </span>
        </li>
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{partial.refundPercent} % refusion</span>
          <span className="opacity-70">
            fra {dtf.format(cutoffs.freeUntil)} til og med {dtf.format(cutoffs.fullFeeFrom)}
          </span>
        </li>
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">0 % refusion — 100 % cancellation fee</span>
          <span className="opacity-70">
            hvis du aflyser efter {dtf.format(cutoffs.fullFeeFrom)}
          </span>
        </li>
      </ul>
      <p className="mt-3 text-xs opacity-60">
        Bookingen starter {dtf.format(start)}. Gratis aflysning udløber{" "}
        <strong>{dtf.format(cutoffs.freeUntil)}</strong> ({full.minHoursBeforeStart} timer før start), og fra{" "}
        <strong>{dtf.format(cutoffs.fullFeeFrom)}</strong> ({partial.minHoursBeforeStart} timer før start)
        opkræves 100 % cancellation fee. Tidspunkterne vises i din lokale tid. Er beløbet endnu ikke hævet,
        annulleres reservationen i stedet, og der opkræves intet. Klager skal indgives senest{" "}
        {policy.complaintWindowHours} timer efter opgavens planlagte eller registrerede afslutning.
      </p>
    </section>
  );
}
