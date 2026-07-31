import { describe, it, expect } from "vitest";
import {
  computeMileageAllowance,
  sanitizeMileageEntryInput,
  selectMileageCountryRule,
  type MileageCountryRule,
} from "../../../supabase/functions/_shared/mileageAllowance";

const DK_2025: MileageCountryRule = {
  id: "rule-dk-2025",
  country_code: "DK",
  version: "DK-2025.1",
  valid_from: "2025-01-01",
  valid_to: "2025-12-31",
  currency: "DKK",
  rate_bands: [
    { from_km: 0, to_km: 20, minor_per_km: 379 },
    { from_km: 20, to_km: null, minor_per_km: 223 },
  ],
  allowed_transport_modes: ["own_car", "own_motorcycle"],
};

const DK_2026: MileageCountryRule = {
  ...DK_2025,
  id: "rule-dk-2026",
  version: "DK-2026.1",
  valid_from: "2026-01-01",
  valid_to: null,
  rate_bands: [
    { from_km: 0, to_km: 20, minor_per_km: 400 },
    { from_km: 20, to_km: null, minor_per_km: 230 },
  ],
};

const SE_2026: MileageCountryRule = {
  id: "rule-se-2026",
  country_code: "SE",
  version: "SE-2026.1",
  valid_from: "2026-01-01",
  valid_to: null,
  currency: "SEK",
  rate_bands: [{ from_km: 0, to_km: null, minor_per_km: 250 }],
  allowed_transport_modes: ["own_car"],
};

const RULES = [DK_2025, DK_2026, SE_2026];

const base = {
  rules: RULES,
  countryCode: "DK",
  travelDate: "2026-03-10",
  outboundDistanceKm: 10,
  returnDistanceKm: 10,
  transportMode: "own_car" as const,
};

describe("mileage allowance — client input is never trusted", () => {
  it("overwrites a fake client-supplied allowance amount", () => {
    const forged = {
      travel_date: "2026-03-10",
      outbound_distance_km: 10,
      return_distance_km: 10,
      estimated_allowance_amount: 999_999,
      currency: "BTC",
    };
    const sanitized = sanitizeMileageEntryInput(forged);
    expect("estimated_allowance_amount" in sanitized).toBe(false);

    const result = computeMileageAllowance(base);
    // 20 km × 400 minor = 8000, nowhere near the forged 999_999.
    expect(result.allowanceMinor).toBe(8000);
    expect(result.allowanceMinor).not.toBe(forged.estimated_allowance_amount);
  });

  it("overwrites a fake client-supplied currency", () => {
    const forged = { currency: "BTC" };
    const sanitized = sanitizeMileageEntryInput(forged);
    expect("currency" in sanitized).toBe(false);

    const result = computeMileageAllowance(base);
    expect(result.currency).toBe("DKK");
    expect(result.currency).not.toBe(forged.currency);
  });

  it("derives currency from the country rule, not the request country name", () => {
    const result = computeMileageAllowance({ ...base, countryCode: "SE" });
    expect(result.currency).toBe("SEK");
  });
});

describe("dated country rule selection", () => {
  it("selects the rule valid on the travel date", () => {
    const older = computeMileageAllowance({ ...base, travelDate: "2025-06-01" });
    expect(older.ruleVersion).toBe("DK-2025.1");
    expect(older.allowanceMinor).toBe(20 * 379);

    const newer = computeMileageAllowance({ ...base, travelDate: "2026-03-10" });
    expect(newer.ruleVersion).toBe("DK-2026.1");
    expect(newer.allowanceMinor).toBe(20 * 400);
  });

  it("applies distance bands across the combined outbound + return distance", () => {
    const result = computeMileageAllowance({
      ...base,
      outboundDistanceKm: 30,
      returnDistanceKm: 30,
    });
    // 20 km @400 + 40 km @230 = 8000 + 9200
    expect(result.totalDistanceKm).toBe(60);
    expect(result.allowanceMinor).toBe(8000 + 9200);
  });

  it("rejects an explicit rule version that is not valid for the travel date", () => {
    const result = computeMileageAllowance({
      ...base,
      travelDate: "2026-03-10",
      requestedRuleVersion: "DK-2025.1",
    });
    expect(result.status).toBe("rejected");
    expect(result.code).toBe("rule_version_not_valid_for_date");
    expect(result.allowanceMinor).toBe(0);
    expect(result.currency).toBeNull();
  });

  it("rejects an unknown rule version", () => {
    const result = computeMileageAllowance({ ...base, requestedRuleVersion: "DK-1999.9" });
    expect(result.code).toBe("unknown_rule_version");
    expect(result.status).toBe("rejected");
  });

  it("accepts an explicit rule version that is valid for the travel date", () => {
    const result = computeMileageAllowance({
      ...base,
      travelDate: "2025-06-01",
      requestedRuleVersion: "DK-2025.1",
    });
    expect(result.status).toBe("calculated");
    expect(result.ruleVersion).toBe("DK-2025.1");
  });

  it("rejects a travel date with no valid rule", () => {
    const result = computeMileageAllowance({ ...base, travelDate: "2020-01-01" });
    expect(result.code).toBe("no_rule_for_date");
    expect(result.allowanceMinor).toBe(0);
  });

  it("ignores archived rules", () => {
    const resolution = selectMileageCountryRule({
      rules: [{ ...DK_2026, status: "archived" }],
      countryCode: "DK",
      travelDate: "2026-03-10",
    });
    expect(resolution.rule).toBeNull();
  });
});

describe("no-allowance cases", () => {
  it("gives no allowance for public transport", () => {
    const result = computeMileageAllowance({ ...base, transportMode: "public_transport" });
    expect(result.status).toBe("no_allowance");
    expect(result.code).toBe("transport_mode_not_eligible");
    expect(result.allowanceMinor).toBe(0);
  });

  it("gives no allowance for a transport mode outside the rule", () => {
    const result = computeMileageAllowance({ ...base, transportMode: "own_bicycle" });
    expect(result.allowanceMinor).toBe(0);
  });

  it("gives no allowance for rejected entries", () => {
    const result = computeMileageAllowance({ ...base, entryStatus: "rejected" });
    expect(result.code).toBe("entry_not_allowance_bearing");
    expect(result.allowanceMinor).toBe(0);
  });

  it("rejects negative distances", () => {
    const result = computeMileageAllowance({ ...base, outboundDistanceKm: -5 });
    expect(result.status).toBe("rejected");
    expect(result.code).toBe("invalid_distance");
    expect(result.allowanceMinor).toBe(0);
  });
});
