import { describe, it, expect } from "vitest";
import {
  isAiGenerated,
  isAutomatedSystemMessage,
  isHumanReviewedAiDraft,
  resolveSenderType,
} from "./senderType";

describe("senderType", () => {
  it("labels AI only from sender_type, never from text", () => {
    expect(isAiGenerated({ sender_type: "ai_assistant" })).toBe(true);
    // Text that *looks* like AI must never be labelled as AI.
    expect(
      isAiGenerated({ sender_type: "support_agent", sender_role: "support" }),
    ).toBe(false);
    expect(isAiGenerated({ sender_type: "customer" })).toBe(false);
    expect(isAiGenerated({ sender_type: "provider" })).toBe(false);
    expect(isAiGenerated({ sender_type: "system" })).toBe(false);
  });

  it("maps legacy sender_role rows without inventing AI labels", () => {
    expect(resolveSenderType({ sender_role: "support" })).toBe("support_agent");
    expect(resolveSenderType({ sender_role: "admin" })).toBe("support_agent");
    expect(resolveSenderType({ sender_role: "customer" })).toBe("customer");
    expect(resolveSenderType({ sender_role: "system" })).toBe("system");
    expect(isAiGenerated({ sender_role: "support" })).toBe(false);
  });

  it("treats automated platform messages as system, not AI", () => {
    const m = { sender_type: "system" as const };
    expect(isAutomatedSystemMessage(m)).toBe(true);
    expect(isAiGenerated(m)).toBe(false);
  });

  it("attributes a reviewed AI draft to the human who sent it", () => {
    const reviewed = {
      sender_type: "support_agent" as const,
      ai_drafted: true,
      ai_draft_reviewed_by: "11111111-1111-1111-1111-111111111111",
    };
    expect(isAiGenerated(reviewed)).toBe(false);
    expect(isHumanReviewedAiDraft(reviewed)).toBe(true);
  });

  it("does not count an unreviewed draft as human reviewed", () => {
    expect(
      isHumanReviewedAiDraft({
        sender_type: "support_agent",
        ai_drafted: true,
        ai_draft_reviewed_by: null,
      }),
    ).toBe(false);
  });

  it("preserves the label through an export/reopen round trip", () => {
    const stored = [
      { id: "1", sender_type: "ai_assistant" },
      { id: "2", sender_type: "support_agent" },
    ];
    const exported = JSON.parse(JSON.stringify(stored));
    expect(exported.map(isAiGenerated)).toEqual([true, false]);
  });
});
