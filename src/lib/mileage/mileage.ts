export type MileageReturnMode =
  | "return_to_origin"
  | "continue_to_next_booking"
  | "one_way"
  | "manual";

export type MileageStatus = "proposed" | "confirmed" | "rejected" | "needs_review";

export interface MileageProposalInput {
  outboundDistanceKm: number;
  returnDistanceKm?: number;
  returnMode: MileageReturnMode;
  vehicleType: "private_car" | "company_car" | "motorcycle" | "bicycle" | "public_transport" | "other";
}

export interface MileageProposal {
  outboundDistanceKm: number;
  returnDistanceKm: number;
  totalDistanceKm: number;
  status: MileageStatus;
  requiresProviderConfirmation: boolean;
}

const roundKm = (value: number): number => Math.round(value * 1000) / 1000;

export function createMileageProposal(input: MileageProposalInput): MileageProposal {
  if (!Number.isFinite(input.outboundDistanceKm) || input.outboundDistanceKm < 0) {
    throw new Error("Outbound distance must be a finite, non-negative number");
  }

  if (
    input.returnDistanceKm !== undefined &&
    (!Number.isFinite(input.returnDistanceKm) || input.returnDistanceKm < 0)
  ) {
    throw new Error("Return distance must be a finite, non-negative number");
  }

  if (input.vehicleType === "public_transport") {
    return {
      outboundDistanceKm: roundKm(input.outboundDistanceKm),
      returnDistanceKm: 0,
      totalDistanceKm: 0,
      status: "rejected",
      requiresProviderConfirmation: false,
    };
  }

  const returnDistanceKm =
    input.returnMode === "return_to_origin"
      ? input.returnDistanceKm ?? input.outboundDistanceKm
      : input.returnDistanceKm ?? 0;

  const outboundDistanceKm = roundKm(input.outboundDistanceKm);
  const roundedReturnDistanceKm = roundKm(returnDistanceKm);

  return {
    outboundDistanceKm,
    returnDistanceKm: roundedReturnDistanceKm,
    totalDistanceKm: roundKm(outboundDistanceKm + roundedReturnDistanceKm),
    status: "proposed",
    requiresProviderConfirmation: true,
  };
}

export function estimateMileageAllowance(
  distanceKm: number,
  ratePerKm: number | null,
): number | null {
  if (ratePerKm === null) return null;
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("Distance must be a finite, non-negative number");
  }
  if (!Number.isFinite(ratePerKm) || ratePerKm < 0) {
    throw new Error("Rate must be a finite, non-negative number");
  }

  return Math.round(distanceKm * ratePerKm * 100) / 100;
}
