/**
 * MyCleaner — canonical cancellation & refund policy.
 *
 * SINGLE SOURCE OF TRUTH for the refund ladder used by:
 *   • the backend refund engine (mirrored in
 *     `supabase/functions/_shared/cancellationPolicy.ts`, kept byte-identical
 *     by `src/lib/cancellationPolicy.parity.test.ts`)
 *   • customer-facing UI (booking confirmation, bookings list, FAQ, Regler)
 *   • the Legal Center documents MC-CANCELLATION-POLICY-001 and
 *     MC-REFUND-POLICY-001
 *
 * The ladder itself is an ECONOMIC rule. Do not change the numbers without an
 * explicit, separately approved decision — several published legal documents
 * quote them verbatim.
 */

export type CancellationTierKey = "full" | "partial" | "none";

export interface CancellationTier {
  /** Stable identifier — safe to persist in policy snapshots. */
  key: CancellationTierKey;
  /**
   * Inclusive lower bound, in hours before service start, at which this tier
   * applies. Evaluated from the highest bound down.
   */
  minHoursBeforeStart: number;
  /** Percentage of the captured gross amount refunded to the customer. */
  refundPercent: number;
}

/** Ordered high → low. Evaluation picks the first matching tier. */
export const CANCELLATION_TIERS: readonly CancellationTier[] = [
  { key: "full", minHoursBeforeStart: 48, refundPercent: 100 },
  { key: "partial", minHoursBeforeStart: 24, refundPercent: 50 },
  { key: "none", minHoursBeforeStart: 0, refundPercent: 0 },
] as const;

/** Hours after the planned or recorded end of a service to file a complaint. */
export const COMPLAINT_WINDOW_HOURS = 48;

const MS_PER_HOUR = 3_600_000;

/**
 * Hours from `now` until `serviceStart`. Clamped at 0, so a service that has
 * already started (or is in progress) always resolves to the `none` tier.
 * Both arguments are absolute instants, which makes the calculation immune to
 * timezone and DST boundaries.
 */
export function hoursUntilServiceStart(serviceStart: Date | string | number, now: Date | string | number = new Date()): number {
  const startMs = new Date(serviceStart).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, (startMs - nowMs) / MS_PER_HOUR);
}

/** Resolve the tier for a given number of hours before service start. */
export function tierForHours(hoursUntilService: number): CancellationTier {
  const hours = Number.isFinite(hoursUntilService) ? Math.max(0, hoursUntilService) : 0;
  for (const tier of CANCELLATION_TIERS) {
    if (hours >= tier.minHoursBeforeStart) return tier;
  }
  return CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1];
}

/**
 * Refund percentage (0–100) for a cancellation made `hoursUntilService` before
 * the service starts. This is the exact function the backend applies.
 */
export function refundPercentForHours(hoursUntilService: number): number {
  return tierForHours(hoursUntilService).refundPercent;
}

/** Convenience: resolve the tier directly from two instants. */
export function tierForBooking(serviceStart: Date | string | number, now: Date | string | number = new Date()): CancellationTier {
  return tierForHours(hoursUntilServiceStart(serviceStart, now));
}

export interface CancellationDeadline {
  tier: CancellationTier;
  /**
   * The exact instant at which this tier stops applying. Cancelling AT this
   * instant still yields `tier.refundPercent` (bounds are inclusive);
   * one millisecond later drops to the next tier down.
   */
  until: Date | null;
}

/**
 * Absolute cut-off instants for a concrete booking, for display in the booking
 * confirmation and in "my bookings". `until` is null for the final tier, which
 * runs all the way to service start and beyond.
 */
export function cancellationDeadlines(serviceStart: Date | string | number): CancellationDeadline[] {
  const startMs = new Date(serviceStart).getTime();
  return CANCELLATION_TIERS.map((tier, index) => {
    const isLast = index === CANCELLATION_TIERS.length - 1;
    return {
      tier,
      until: isLast || !Number.isFinite(startMs)
        ? null
        : new Date(startMs - tier.minHoursBeforeStart * MS_PER_HOUR),
    };
  });
}
