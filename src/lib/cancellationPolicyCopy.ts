/**
 * Customer-facing copy for the cancellation ladder, DERIVED from the canonical
 * policy in `cancellationPolicy.ts`. Public pages must never hardcode the hour
 * thresholds — before the v2 activation instant these helpers describe 48/24,
 * from the activation instant they describe 18/8.
 *
 * i18n: every sentence lives in the `common` namespace under
 * `cancellation.ladder.*`. Callers pass a translator (`t` from
 * react-i18next); when none is supplied the Danish source copy below is used,
 * so non-React callers and policy parity tests keep working.
 */
import {
  currentCancellationPolicy,
  type CancellationPolicy,
  type CancellationTier,
} from "./cancellationPolicy";

/** Minimal translator shape — compatible with react-i18next's `t`. */
export type LadderTranslate = (
  key: string,
  vars: Record<string, string | number>,
) => string;

/** Danish source strings; mirrored in public/locales/<lang>/common.json. */
const DA_SOURCE: Record<string, string> = {
  "cancellation.ladder.when": "før bookingens præcise starttidspunkt",
  "cancellation.ladder.bullet.fullExclusive":
    "Mere end {{hours}} timer {{when}}: gratis aflysning og {{percent}} % refusion.",
  "cancellation.ladder.bullet.fullInclusive":
    "{{hours}} timer eller mere {{when}}: gratis aflysning og {{percent}} % refusion.",
  "cancellation.ladder.bullet.partialExclusive":
    "Fra og med {{from}} timer til og med {{to}} timer {{when}}: {{percent}} % refusion.",
  "cancellation.ladder.bullet.partialInclusive":
    "Fra og med {{from}} timer og under {{to}} timer {{when}}: {{percent}} % refusion.",
  "cancellation.ladder.bullet.none":
    "Under {{hours}} timer {{when}}: 0 % refusion — der opkræves 100 % cancellation fee.",
  "cancellation.ladder.sentence.exclusive":
    "Aflyser du mere end {{fullHours}} timer {{when}}, er aflysningen gratis med {{fullPercent}} % refusion. Fra og med {{partialHours}} og til og med {{fullHours}} timer før start refunderes {{partialPercent}} %. Under {{partialHours}} timer før start er der 0 % refusion, og der opkræves 100 % cancellation fee.",
  "cancellation.ladder.sentence.inclusive":
    "Aflyser du {{fullHours}} timer eller mere {{when}}, er aflysningen gratis med {{fullPercent}} % refusion. Fra og med {{partialHours}} og under {{fullHours}} timer før start refunderes {{partialPercent}} %. Under {{partialHours}} timer før start er der 0 % refusion, og der opkræves 100 % cancellation fee.",
};

function fallback(key: string, vars: Record<string, string | number>): string {
  const template = DA_SOURCE[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(vars[name] ?? ""),
  );
}

function translator(t?: LadderTranslate): LadderTranslate {
  if (!t) return fallback;
  return (key, vars) => t(key, { ...vars, defaultValue: fallback(key, vars) } as never);
}

function tier(policy: CancellationPolicy, key: CancellationTier["key"]): CancellationTier {
  return policy.tiers.find((x) => x.key === key) ?? policy.tiers[policy.tiers.length - 1];
}

/** Three bullets describing the ladder, high → low. */
export function cancellationLadderBullets(
  policy: CancellationPolicy = currentCancellationPolicy(),
  t?: LadderTranslate,
): string[] {
  const tr = translator(t);
  const when = tr("cancellation.ladder.when", {});
  const full = tier(policy, "full");
  const partial = tier(policy, "partial");
  return [
    tr(
      full.boundExclusive
        ? "cancellation.ladder.bullet.fullExclusive"
        : "cancellation.ladder.bullet.fullInclusive",
      { hours: full.minHoursBeforeStart, percent: full.refundPercent, when },
    ),
    tr(
      full.boundExclusive
        ? "cancellation.ladder.bullet.partialExclusive"
        : "cancellation.ladder.bullet.partialInclusive",
      {
        from: partial.minHoursBeforeStart,
        to: full.minHoursBeforeStart,
        percent: partial.refundPercent,
        when,
      },
    ),
    tr("cancellation.ladder.bullet.none", {
      hours: partial.minHoursBeforeStart,
      when,
    }),
  ];
}

/** One-paragraph FAQ answer describing the same ladder. */
export function cancellationLadderSentence(
  policy: CancellationPolicy = currentCancellationPolicy(),
  t?: LadderTranslate,
): string {
  const tr = translator(t);
  const full = tier(policy, "full");
  const partial = tier(policy, "partial");
  return tr(
    full.boundExclusive
      ? "cancellation.ladder.sentence.exclusive"
      : "cancellation.ladder.sentence.inclusive",
    {
      when: tr("cancellation.ladder.when", {}),
      fullHours: full.minHoursBeforeStart,
      fullPercent: full.refundPercent,
      partialHours: partial.minHoursBeforeStart,
      partialPercent: partial.refundPercent,
    },
  );
}
