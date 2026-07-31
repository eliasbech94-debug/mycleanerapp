/**
 * Danish customer-facing copy for the cancellation ladder, DERIVED from the
 * canonical policy in `cancellationPolicy.ts`. Public pages must never
 * hardcode the hour thresholds — before the v2 activation instant these
 * helpers describe 48/24, from the activation instant they describe 18/8.
 */
import {
  currentCancellationPolicy,
  type CancellationPolicy,
  type CancellationTier,
} from "./cancellationPolicy";

function tier(policy: CancellationPolicy, key: CancellationTier["key"]): CancellationTier {
  return policy.tiers.find((t) => t.key === key) ?? policy.tiers[policy.tiers.length - 1];
}

const WHEN = "før bookingens præcise starttidspunkt";

/** Three bullets describing the ladder, high → low. */
export function cancellationLadderBullets(
  policy: CancellationPolicy = currentCancellationPolicy(),
): string[] {
  const full = tier(policy, "full");
  const partial = tier(policy, "partial");
  const upper = full.boundExclusive
    ? `Mere end ${full.minHoursBeforeStart} timer`
    : `${full.minHoursBeforeStart} timer eller mere`;
  const middleUpper = full.boundExclusive
    ? `til og med ${full.minHoursBeforeStart} timer`
    : `og under ${full.minHoursBeforeStart} timer`;
  return [
    `${upper} ${WHEN}: gratis aflysning og ${full.refundPercent} % refusion.`,
    `Fra og med ${partial.minHoursBeforeStart} timer ${middleUpper} ${WHEN}: ${partial.refundPercent} % refusion.`,
    `Under ${partial.minHoursBeforeStart} timer ${WHEN}: 0 % refusion — der opkræves 100 % cancellation fee.`,
  ];
}

/** One-paragraph FAQ answer describing the same ladder. */
export function cancellationLadderSentence(
  policy: CancellationPolicy = currentCancellationPolicy(),
): string {
  const full = tier(policy, "full");
  const partial = tier(policy, "partial");
  const upper = full.boundExclusive
    ? `mere end ${full.minHoursBeforeStart} timer`
    : `${full.minHoursBeforeStart} timer eller mere`;
  const middle = full.boundExclusive
    ? `Fra og med ${partial.minHoursBeforeStart} og til og med ${full.minHoursBeforeStart} timer før start`
    : `Fra og med ${partial.minHoursBeforeStart} og under ${full.minHoursBeforeStart} timer før start`;
  return (
    `Aflyser du ${upper} før bookingens præcise starttidspunkt, er aflysningen gratis med ${full.refundPercent} % refusion. ` +
    `${middle} refunderes ${partial.refundPercent} %. ` +
    `Under ${partial.minHoursBeforeStart} timer før start er der 0 % refusion, og der opkræves 100 % cancellation fee.`
  );
}
