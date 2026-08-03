// Server-side mileage allowance engine — single source of truth.
//
// SECURITY: `estimated_allowance_amount` and `currency` are NEVER accepted from
// client input. Both are derived here from (outbound + return) distance, the
// applicable versioned `mileage_country_rules` row, the travel date and the
// country code. The Edge Function and the database trigger both use this exact
// logic so a forged client payload can never influence a stored amount.

export type TransportMode =
  | "own_car"
  | "own_motorcycle"
  | "own_bicycle"
  | "public_transport"
  | "customer_vehicle"
  | "walking";

export type MileageEntryStatus = "draft" | "submitted" | "approved" | "rejected";

export interface MileageRateBand {
  /** Inclusive lower bound of the band, in whole kilometres. */
  from_km: number;
  /** Exclusive upper bound, or null for the open-ended top band. */
  to_km: number | null;
  /** Rate in minor currency units per kilometre. */
  minor_per_km: number;
}

export interface MileageCountryRule {
  id: string;
  country_code: string;
  /** Immutable, human readable version identifier, e.g. "DK-2026.1". */
  version: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  valid_from: string;
  /** ISO date (YYYY-MM-DD), inclusive. null = open ended. */
  valid_to: string | null;
  currency: string;
  rate_bands: MileageRateBand[];
  /** Transport modes that generate an allowance in this jurisdiction. */
  allowed_transport_modes: TransportMode[];
  status?: "active" | "archived";
}

export type MileageResolutionCode =
  | "resolved"
  | "no_rule_for_country"
  | "no_rule_for_date"
  | "unknown_rule_version"
  | "rule_version_not_valid_for_date"
  | "invalid_distance"
  | "transport_mode_not_eligible"
  | "entry_not_allowance_bearing";

export interface MileageComputation {
  status: "calculated" | "no_allowance" | "rejected";
  code: MileageResolutionCode;
  /** Always server-derived. Never echoed from client input. */
  allowanceMinor: number;
  /** Always server-derived. null only when no rule could be resolved. */
  currency: string | null;
  ruleId: string | null;
  ruleVersion: string | null;
  totalDistanceKm: number;
  reason: string;
}

export interface ComputeMileageArgs {
  rules: MileageCountryRule[];
  countryCode: string;
  /** ISO date (YYYY-MM-DD) of the trip. */
  travelDate: string;
  outboundDistanceKm: number;
  returnDistanceKm: number;
  transportMode: TransportMode;
  /** Optional explicit rule version requested by the caller. */
  requestedRuleVersion?: string | null;
  /** Entry lifecycle status — rejected entries never carry an allowance. */
  entryStatus?: MileageEntryStatus;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isWithin(rule: MileageCountryRule, date: string): boolean {
  if (date < rule.valid_from) return false;
  if (rule.valid_to && date > rule.valid_to) return false;
  return true;
}

export interface RuleResolution {
  code: MileageResolutionCode;
  rule: MileageCountryRule | null;
  reason: string;
}

/**
 * Picks the versioned country rule that governs `travelDate`.
 * An explicitly requested version is rejected when it is not valid for that date.
 */
export function selectMileageCountryRule(args: {
  rules: MileageCountryRule[];
  countryCode: string;
  travelDate: string;
  requestedRuleVersion?: string | null;
}): RuleResolution {
  const { travelDate, requestedRuleVersion } = args;
  const country = (args.countryCode ?? "").toUpperCase();
  const candidates = (args.rules ?? []).filter(
    (rule) =>
      rule.country_code.toUpperCase() === country && (rule.status ?? "active") !== "archived",
  );

  if (!ISO_DATE.test(travelDate)) {
    return { code: "no_rule_for_date", rule: null, reason: "Rejsedatoen er ugyldig." };
  }
  if (candidates.length === 0) {
    return {
      code: "no_rule_for_country",
      rule: null,
      reason: "Der findes ingen kørselsregler for landet.",
    };
  }

  if (requestedRuleVersion) {
    const requested = candidates.find((rule) => rule.version === requestedRuleVersion);
    if (!requested) {
      return {
        code: "unknown_rule_version",
        rule: null,
        reason: "Den angivne regelversion findes ikke for landet.",
      };
    }
    if (!isWithin(requested, travelDate)) {
      return {
        code: "rule_version_not_valid_for_date",
        rule: null,
        reason: "Den angivne regelversion er ikke gyldig på rejsedatoen.",
      };
    }
    return { code: "resolved", rule: requested, reason: "Regelversion valgt eksplicit." };
  }

  const valid = candidates
    .filter((rule) => isWithin(rule, travelDate))
    // Latest starting rule wins when validity ranges overlap.
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : a.valid_from > b.valid_from ? -1 : 0));

  if (valid.length === 0) {
    return {
      code: "no_rule_for_date",
      rule: null,
      reason: "Der findes ingen gyldig kørselsregel på rejsedatoen.",
    };
  }
  return { code: "resolved", rule: valid[0], reason: "Regelversion valgt ud fra rejsedatoen." };
}

/** Half-away-from-zero rounding on minor units — matches the SQL helper. */
export function roundHalfAway(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : -Math.floor(-value + 0.5);
}

/** Applies the rule's cumulative distance bands to a trip distance. */
export function applyRateBands(rule: MileageCountryRule, distanceKm: number): number | null {
  const bands = [...(rule.rate_bands ?? [])].sort((a, b) => a.from_km - b.from_km);
  if (bands.length === 0) return null;

  let remaining = distanceKm;
  let position = 0;
  let totalMinor = 0;

  while (remaining > 0) {
    const band = bands.find(
      (candidate) =>
        position >= candidate.from_km && (candidate.to_km == null || position < candidate.to_km),
    );
    if (!band) return null;
    const capacity = band.to_km == null ? remaining : band.to_km - position;
    const consumed = Math.min(remaining, capacity);
    totalMinor += consumed * band.minor_per_km;
    remaining -= consumed;
    position += consumed;
  }
  return roundHalfAway(totalMinor);
}

function noAllowance(
  code: MileageResolutionCode,
  reason: string,
  rule: MileageCountryRule | null,
  distance: number,
  status: MileageComputation["status"] = "no_allowance",
): MileageComputation {
  return {
    status,
    code,
    allowanceMinor: 0,
    currency: rule?.currency ?? null,
    ruleId: rule?.id ?? null,
    ruleVersion: rule?.version ?? null,
    totalDistanceKm: distance,
    reason,
  };
}

/**
 * The only supported way to produce an allowance amount and its currency.
 * Client supplied amounts/currencies must be discarded before calling this.
 */
export function computeMileageAllowance(args: ComputeMileageArgs): MileageComputation {
  const outbound = Number(args.outboundDistanceKm ?? 0);
  const back = Number(args.returnDistanceKm ?? 0);
  const total = Number((outbound + back).toFixed(3));

  if (!Number.isFinite(outbound) || !Number.isFinite(back) || outbound < 0 || back < 0) {
    return noAllowance("invalid_distance", "Distancen er ugyldig.", null, 0, "rejected");
  }

  const resolution = selectMileageCountryRule({
    rules: args.rules,
    countryCode: args.countryCode,
    travelDate: args.travelDate,
    requestedRuleVersion: args.requestedRuleVersion ?? null,
  });

  if (resolution.code !== "resolved" || !resolution.rule) {
    return noAllowance(resolution.code, resolution.reason, null, total, "rejected");
  }
  const rule = resolution.rule;

  if (args.entryStatus === "rejected") {
    return noAllowance(
      "entry_not_allowance_bearing",
      "Afviste registreringer udløser ingen kørselsgodtgørelse.",
      rule,
      total,
    );
  }

  // Public transport (and any non-eligible mode) never generates mileage.
  if (
    args.transportMode === "public_transport" ||
    !rule.allowed_transport_modes.includes(args.transportMode)
  ) {
    return noAllowance(
      "transport_mode_not_eligible",
      "Transportformen udløser ingen kørselsgodtgørelse.",
      rule,
      total,
    );
  }

  const minor = applyRateBands(rule, total);
  if (minor == null) {
    return noAllowance(
      "no_rule_for_date",
      "Der findes ingen sats for distancen i den gyldige regelversion.",
      rule,
      total,
      "rejected",
    );
  }

  return {
    status: "calculated",
    code: "resolved",
    allowanceMinor: minor,
    currency: rule.currency,
    ruleId: rule.id,
    ruleVersion: rule.version,
    totalDistanceKm: total,
    reason: resolution.reason,
  };
}

/**
 * Strips every client-controlled money field from an incoming payload.
 * Anything money-shaped must be recomputed by `computeMileageAllowance`.
 */
export function sanitizeMileageEntryInput<T extends Record<string, unknown>>(
  input: T,
): Omit<
  T,
  | "estimated_allowance_amount"
  | "estimated_allowance_minor"
  | "allowance_minor"
  | "currency"
  | "rate_minor_per_km"
> {
  const clone = { ...input } as Record<string, unknown>;
  for (const field of [
    "estimated_allowance_amount",
    "estimated_allowance_minor",
    "allowance_minor",
    "currency",
    "rate_minor_per_km",
  ]) {
    delete clone[field];
  }
  return clone as Omit<
    T,
    | "estimated_allowance_amount"
    | "estimated_allowance_minor"
    | "allowance_minor"
    | "currency"
    | "rate_minor_per_km"
  >;
}
