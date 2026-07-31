/**
 * MyCleaner — canonical cancellation & refund policy (edge runtime copy).
 *
 * Kept byte-identical with `src/lib/cancellationPolicy.ts` below the header;
 * `src/lib/cancellationPolicy.parity.test.ts` fails the build if they drift.
 *
 * The ladder itself is an ECONOMIC rule. Do not change the numbers without an
 * explicit, separately approved decision.
 *
 * ACTIVATION. v2 (18/8) only applies to bookings created at or after
 * `CANCELLATION_POLICY_V2_ACTIVATION_AT`, and only while the kill switch is on.
 * Fail-safe is always v1.0.0 (48/24).
 */

/**
 * Kill switch — AUTHORITATIVE, server-only. A client can never influence it.
 *
 * v2 (18/8) is chosen ONLY when the secret `CANCELLATION_POLICY_V2_ENABLED`
 * is exactly "true" AND the activation instant has passed. Any other value,
 * or an unset secret, fails safe to v1.0.0 (48/24) for every NEW booking.
 * Flipping the secret takes effect immediately and never touches existing
 * booking snapshots.
 */
const CANCELLATION_POLICY_V2_ENABLED_DEFAULT =
  (globalThis as { Deno?: { env: { get(key: string): string | undefined } } })
    .Deno?.env.get("CANCELLATION_POLICY_V2_ENABLED")?.trim().toLowerCase() === "true";

export type CancellationTierKey = "full" | "partial" | "none";

export interface CancellationTier {
  /** Stable identifier — safe to persist in policy snapshots. */
  key: CancellationTierKey;
  /**
   * Lower bound, in hours before service start, at which this tier applies.
   * Evaluated from the highest bound down.
   */
  minHoursBeforeStart: number;
  /**
   * When true the bound is strict (`hours > min`), so cancelling exactly at
   * the bound falls to the next tier down. When false it is inclusive
   * (`hours >= min`).
   */
  boundExclusive: boolean;
  /** Percentage of the captured gross amount refunded to the customer. */
  refundPercent: number;
}

export interface CancellationPolicy {
  /** Semantic version persisted on the booking snapshot. */
  version: string;
  /** Ordered high → low. Evaluation picks the first matching tier. */
  tiers: readonly CancellationTier[];
  /** Hours after the planned or recorded end of a service to file a complaint. */
  complaintWindowHours: number;
}

/** Legacy ladder: 48 h / 24 h, inclusive bounds. Bookings accepted before v2. */
const POLICY_V1: CancellationPolicy = {
  version: "1.0.0",
  tiers: [
    { key: "full", minHoursBeforeStart: 48, boundExclusive: false, refundPercent: 100 },
    { key: "partial", minHoursBeforeStart: 24, boundExclusive: false, refundPercent: 50 },
    { key: "none", minHoursBeforeStart: 0, boundExclusive: false, refundPercent: 0 },
  ],
  complaintWindowHours: 48,
};

/**
 * Current ladder (18 / 8):
 *   • more than 18 h before start        → 100 % refund (free cancellation)
 *   • from 8 h up to and including 18 h  → 50 % refund
 *   • less than 8 h before start         → 0 % refund / 100 % cancellation fee
 */
const POLICY_V2: CancellationPolicy = {
  version: "2.0.0",
  tiers: [
    { key: "full", minHoursBeforeStart: 18, boundExclusive: true, refundPercent: 100 },
    { key: "partial", minHoursBeforeStart: 8, boundExclusive: false, refundPercent: 50 },
    { key: "none", minHoursBeforeStart: 0, boundExclusive: false, refundPercent: 0 },
  ],
  complaintWindowHours: 48,
};

export const CANCELLATION_POLICY_VERSIONS: Readonly<Record<string, CancellationPolicy>> = {
  [POLICY_V1.version]: POLICY_V1,
  [POLICY_V2.version]: POLICY_V2,
};

/**
 * Coordinated activation instant for the 18/8 ladder (v2.0.0).
 * MUST stay byte-identical in the edge copy — the parity test fails the build
 * on any drift. Publishing MC-CANCELLATION-POLICY-001 v1.2.0 and
 * MC-REFUND-POLICY-001 v1.2.0 happens at the same instant.
 */
export const CANCELLATION_POLICY_V2_ACTIVATION_AT = "2026-08-03T06:00:00.000Z";
export const CANCELLATION_POLICY_V2_ACTIVATION_MS = Date.parse(
  CANCELLATION_POLICY_V2_ACTIVATION_AT,
);

/** Fallback for bookings created before snapshots existed. Never the newest. */
export const LEGACY_CANCELLATION_POLICY_VERSION = POLICY_V1.version;
/** The version v2 activation switches to. */
export const NEXT_CANCELLATION_POLICY_VERSION = POLICY_V2.version;

/**
 * THE single policy selector for anything not yet frozen onto a booking.
 *
 *   instant  <  ACTIVATION_AT → v1.0.0 (48/24)
 *   instant >=  ACTIVATION_AT → v2.0.0 (18/8), but only while the kill switch
 *                               is on. Switch off → v1.0.0 (fail-safe).
 *
 * Never used to re-evaluate an existing booking — those always go through
 * `policyForSnapshot()`.
 */
export function policyAt(
  instant: Date | string | number = new Date(),
  v2Enabled: boolean = CANCELLATION_POLICY_V2_ENABLED_DEFAULT,
): CancellationPolicy {
  const ms = new Date(instant).getTime();
  if (!Number.isFinite(ms)) return POLICY_V1;
  return v2Enabled && ms >= CANCELLATION_POLICY_V2_ACTIVATION_MS ? POLICY_V2 : POLICY_V1;
}

/** Policy that applies to a booking created right now. */
export function currentCancellationPolicy(): CancellationPolicy {
  return policyAt(new Date());
}

/** Tiers of the policy that applies right now. */
export function currentCancellationTiers(): readonly CancellationTier[] {
  return currentCancellationPolicy().tiers;
}

/**
 * Hours after the planned or recorded end of a service to file a complaint.
 * Identical across every published version, so it is safe as a constant.
 */
export const COMPLAINT_WINDOW_HOURS = POLICY_V1.complaintWindowHours;

const MS_PER_HOUR = 3_600_000;


/** Resolve a published policy by version. Unknown/missing → legacy, never newest. */
export function policyForVersion(version?: string | null): CancellationPolicy {
  if (version && CANCELLATION_POLICY_VERSIONS[version]) return CANCELLATION_POLICY_VERSIONS[version];
  return CANCELLATION_POLICY_VERSIONS[LEGACY_CANCELLATION_POLICY_VERSION];
}

/**
 * Resolve the policy a concrete booking was sold under, from its persisted
 * `cancellation_policy_snapshot`. Bookings without a snapshot keep the legacy
 * terms — the newest ladder is never applied retroactively.
 */
export function policyForSnapshot(snapshot: unknown): CancellationPolicy {
  const version = (snapshot as { policy_version?: unknown } | null | undefined)?.policy_version;
  return policyForVersion(typeof version === "string" ? version : null);
}

/**
 * The object frozen onto a booking at creation time. Persisted verbatim so the
 * accepted terms survive any later policy change.
 */
export function cancellationPolicySnapshot(
  policy: CancellationPolicy = currentCancellationPolicy(),
  acceptedAt: Date | string | number = new Date(),
): Record<string, unknown> {
  return {
    policy_version: policy.version,
    accepted_at: new Date(acceptedAt).toISOString(),
    complaint_window_hours: policy.complaintWindowHours,
    tiers: policy.tiers.map((t) => ({
      key: t.key,
      min_hours_before_start: t.minHoursBeforeStart,
      bound_exclusive: t.boundExclusive,
      refund_percent: t.refundPercent,
    })),
  };
}

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
export function tierForHours(
  hoursUntilService: number,
  policy: CancellationPolicy = currentCancellationPolicy(),
): CancellationTier {
  const hours = Number.isFinite(hoursUntilService) ? Math.max(0, hoursUntilService) : 0;
  for (const tier of policy.tiers) {
    if (tier.boundExclusive ? hours > tier.minHoursBeforeStart : hours >= tier.minHoursBeforeStart) return tier;
  }
  return policy.tiers[policy.tiers.length - 1];
}

/**
 * Refund percentage (0–100) for a cancellation made `hoursUntilService` before
 * the service starts. This is the exact function the backend applies.
 */
export function refundPercentForHours(
  hoursUntilService: number,
  policy: CancellationPolicy = currentCancellationPolicy(),
): number {
  return tierForHours(hoursUntilService, policy).refundPercent;
}

/** Convenience: resolve the tier directly from two instants. */
export function tierForBooking(
  serviceStart: Date | string | number,
  now: Date | string | number = new Date(),
  policy: CancellationPolicy = currentCancellationPolicy(),
): CancellationTier {
  return tierForHours(hoursUntilServiceStart(serviceStart, now), policy);
}

export interface CancellationDeadline {
  tier: CancellationTier;
  /**
   * The instant at which this tier stops applying. For an inclusive tier,
   * cancelling AT this instant still yields `tier.refundPercent`; for an
   * exclusive tier the customer must cancel strictly before it. `null` for the
   * final tier, which runs all the way to service start and beyond.
   */
  until: Date | null;
}

/**
 * Absolute cut-off instants for a concrete booking, for display in the booking
 * confirmation and in "my bookings".
 */
export function cancellationDeadlines(
  serviceStart: Date | string | number,
  policy: CancellationPolicy = currentCancellationPolicy(),
): CancellationDeadline[] {
  const startMs = new Date(serviceStart).getTime();
  return policy.tiers.map((tier, index) => {
    const isLast = index === policy.tiers.length - 1;
    return {
      tier,
      until: isLast || !Number.isFinite(startMs)
        ? null
        : new Date(startMs - tier.minHoursBeforeStart * MS_PER_HOUR),
    };
  });
}

export interface CancellationCutoffs {
  /** Booking start instant. */
  start: Date;
  /** Free cancellation (100 % refund) applies strictly before this instant. */
  freeUntil: Date;
  /** 50 % refund applies from `freeUntil` up to and including this instant. */
  partialUntil: Date;
  /** From this instant the refund is 0 % — a 100 % cancellation fee. */
  fullFeeFrom: Date;
}

/**
 * The three customer-facing instants for one booking: when free cancellation
 * expires, how long the 50 % band runs, and when the 100 % cancellation fee
 * begins. Derived from the ladder, never hardcoded.
 */
export function cancellationCutoffs(
  serviceStart: Date | string | number,
  policy: CancellationPolicy = currentCancellationPolicy(),
): CancellationCutoffs | null {
  const startMs = new Date(serviceStart).getTime();
  if (!Number.isFinite(startMs)) return null;
  const full = policy.tiers.find((t) => t.key === "full") ?? policy.tiers[0];
  const partial = policy.tiers.find((t) => t.key === "partial") ?? policy.tiers[policy.tiers.length - 1];
  const freeUntil = new Date(startMs - full.minHoursBeforeStart * MS_PER_HOUR);
  const fullFeeFrom = new Date(startMs - partial.minHoursBeforeStart * MS_PER_HOUR);
  return { start: new Date(startMs), freeUntil, partialUntil: fullFeeFrom, fullFeeFrom };
}

const DEFAULT_TIMEZONE = "Europe/Copenhagen";

function timeZoneOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUtc - instantMs;
}

/**
 * Exact start instant of a booking from its stored `booking_date` (YYYY-MM-DD),
 * `slot` (HH:MM local) and IANA `timezone`. DST-correct: the wall-clock time is
 * converted through the zone's offset at that very moment, so the same slot
 * resolves to different UTC instants across a DST boundary.
 *
 * Returns null on malformed input — callers must never silently fall back to
 * midnight UTC.
 */
export function bookingStartInstant(
  bookingDate: string | null | undefined,
  slot: string | null | undefined,
  timeZone: string | null | undefined = DEFAULT_TIMEZONE,
): Date | null {
  if (typeof bookingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) return null;
  if (typeof slot !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(slot.trim());
  if (!m) return null;
  const zone = timeZone && timeZone.trim() ? timeZone.trim() : DEFAULT_TIMEZONE;
  const [y, mo, d] = bookingDate.split("-").map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, Number(m[1]), Number(m[2]), 0);
  let instant = naiveUtc;
  try {
    for (let i = 0; i < 3; i += 1) instant = naiveUtc - timeZoneOffsetMs(instant, zone);
  } catch {
    return null;
  }
  return Number.isFinite(instant) ? new Date(instant) : null;
}
