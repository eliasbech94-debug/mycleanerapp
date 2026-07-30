import { describe, expect, it } from "vitest";
import { createMileageProposal, estimateMileageAllowance } from "./mileage";

describe("createMileageProposal", () => {
  it("defaults return-to-origin to the outbound distance", () => {
    expect(createMileageProposal({
      outboundDistanceKm: 18.4,
      returnMode: "return_to_origin",
      vehicleType: "private_car",
    })).toEqual({
      outboundDistanceKm: 18.4,
      returnDistanceKm: 18.4,
      totalDistanceKm: 36.8,
      status: "proposed",
      requiresProviderConfirmation: true,
    });
  });

  it("does not invent a return trip when continuing to another booking", () => {
    expect(createMileageProposal({
      outboundDistanceKm: 12.25,
      returnMode: "continue_to_next_booking",
      vehicleType: "private_car",
    }).totalDistanceKm).toBe(12.25);
  });

  it("excludes public transport from the mileage ledger", () => {
    expect(createMileageProposal({
      outboundDistanceKm: 8,
      returnMode: "return_to_origin",
      vehicleType: "public_transport",
    }).status).toBe("rejected");
  });

  it("rejects invalid distances", () => {
    expect(() => createMileageProposal({
      outboundDistanceKm: -1,
      returnMode: "one_way",
      vehicleType: "private_car",
    })).toThrow(/non-negative/);
  });
});

describe("estimateMileageAllowance", () => {
  it("returns null for distance-only rules", () => {
    expect(estimateMileageAllowance(100, null)).toBeNull();
  });

  it("rounds informational estimates to two decimals", () => {
    expect(estimateMileageAllowance(36.8, 3.81)).toBe(140.21);
  });
});
