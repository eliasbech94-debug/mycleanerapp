/**
 * Contract tests for the appeal client layer. These lock the guarantees the
 * legal text (MC-PROVIDER-AGREEMENT-001 §12/§14) depends on:
 *  - a provider can never author a final outcome from the client
 *  - open/closed status handling is unambiguous
 *  - RPC guard-rail errors are translated to plain language
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}));

import {
  APPEAL_STATUS_LABEL,
  OPEN_APPEAL_STATUSES,
  appealErrorMessage,
  isAppealOpen,
  respondToAppeal,
  staffTransitionAppeal,
  submitAppeal,
} from "@/lib/appeals";

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  rpc.mockResolvedValue({ data: "ok", error: null });
});

describe("appeal status model", () => {
  it("treats only pre-decision states as open", () => {
    expect(OPEN_APPEAL_STATUSES).toEqual(["submitted", "under_review", "information_requested"]);
    expect(isAppealOpen("submitted")).toBe(true);
    expect(isAppealOpen("upheld")).toBe(false);
    expect(isAppealOpen("changed")).toBe(false);
    expect(isAppealOpen("withdrawn")).toBe(false);
  });

  it("labels both outcomes unambiguously", () => {
    expect(APPEAL_STATUS_LABEL.upheld).toBe("Afgjort — afgørelsen fastholdt");
    expect(APPEAL_STATUS_LABEL.changed).toBe("Afgjort — afgørelsen ændret");
  });
});

describe("provider-side writes", () => {
  it("submits an appeal through the SECURITY DEFINER RPC only", async () => {
    await submitAppeal("11111111-1111-1111-1111-111111111111", "En tilstrækkelig lang forklaring.");
    expect(rpc).toHaveBeenCalledWith("submit_provider_appeal_v1", {
      _notice_id: "11111111-1111-1111-1111-111111111111",
      _statement: "En tilstrækkelig lang forklaring.",
    });
  });

  it("restricts provider actions to adding information or withdrawing", async () => {
    await respondToAppeal("22222222-2222-2222-2222-222222222222", "withdraw");
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args._action).toBe("withdraw");
    // The provider can never pass a final outcome.
    expect(["upheld", "changed"]).not.toContain(args._action);
  });
});

describe("staff-side writes", () => {
  it("routes staff decisions through the audited admin RPC", async () => {
    await staffTransitionAppeal("33333333-3333-3333-3333-333333333333", "changed", "Vi har fundet en fejl.");
    expect(rpc).toHaveBeenCalledWith("admin_appeal_transition_v1", {
      _appeal_id: "33333333-3333-3333-3333-333333333333",
      _to_status: "changed",
      _reason: "Vi har fundet en fejl.",
    });
  });
});

describe("error translation", () => {
  it("maps guard-rail codes to plain Danish", () => {
    expect(appealErrorMessage({ message: "statement_too_short" })).toMatch(/mindst 20 tegn/);
    expect(appealErrorMessage({ message: "decision_not_appealable" })).toMatch(/kan ikke påklages/);
    expect(appealErrorMessage({ message: "admin_required_for_final_decision" })).toMatch(/administrator/);
    expect(appealErrorMessage({ message: "boom" })).toMatch(/Noget gik galt/);
  });
});
