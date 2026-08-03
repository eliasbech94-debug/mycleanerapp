/**
 * Rule Pack Manager — lifecycle transitions.
 *
 * Pure functions. Publishing, retiring and rollback all return a new list;
 * historical accounting periods are never touched, because a closed period
 * stores its own frozen rule pack version.
 */

import type { AccountingRulePack, RulePackStatus } from "../types";
import { evaluatePublishReadiness } from "./validation";
import {
  canPerformRulePackAction,
  explainDeniedAction,
  type RulePackActor,
} from "./permissions";

export const RULE_PACK_STATUS_LABELS: Record<RulePackStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
  retired: "Retired",
};

const ALLOWED_TRANSITIONS: Record<RulePackStatus, RulePackStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "approved"],
  approved: ["draft", "published"],
  published: ["retired"],
  retired: ["published"],
};

export function canTransition(from: RulePackStatus, to: RulePackStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export type LifecycleOutcome =
  | { ok: true; packs: AccountingRulePack[]; message: string }
  | { ok: false; reason: string };

export function publishRulePack(
  packs: AccountingRulePack[],
  packId: string,
  actor: RulePackActor,
  options: { today?: string } = {},
): LifecycleOutcome {
  if (!canPerformRulePackAction(actor, "publish")) {
    return { ok: false, reason: explainDeniedAction(actor, "publish") };
  }
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: "Rule pack findes ikke." };
  if (pack.status !== "approved") {
    return { ok: false, reason: "Kun en godkendt rule pack kan publiceres." };
  }
  const readiness = evaluatePublishReadiness(pack, { otherPacks: packs, today: options.today });
  if (!readiness.ready) {
    const failed = readiness.checks.filter((c) => !c.passed).map((c) => c.label);
    return { ok: false, reason: `Publish blokeret: ${failed.join("; ")}.` };
  }
  return {
    ok: true,
    packs: packs.map((p) => (p.id === packId ? { ...p, status: "published" as const } : p)),
    message: `${pack.countryCode} ${pack.rulePackVersion} er publiceret.`,
  };
}

export function retireRulePack(
  packs: AccountingRulePack[],
  packId: string,
  actor: RulePackActor,
): LifecycleOutcome {
  if (!canPerformRulePackAction(actor, "retire")) {
    return { ok: false, reason: explainDeniedAction(actor, "retire") };
  }
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: "Rule pack findes ikke." };
  if (pack.status !== "published") {
    return { ok: false, reason: "Kun en publiceret rule pack kan pensioneres." };
  }
  return {
    ok: true,
    packs: packs.map((p) => (p.id === packId ? { ...p, status: "retired" as const } : p)),
    message: `${pack.countryCode} ${pack.rulePackVersion} er pensioneret. Lukkede perioder bruger fortsat den frosne version.`,
  };
}

/**
 * Rollback marks an earlier version active again. Only future periods pick it
 * up — closed periods keep their frozen version, so nothing historical moves.
 */
export function rollbackToVersion(
  packs: AccountingRulePack[],
  packId: string,
  actor: RulePackActor,
): LifecycleOutcome {
  if (!canPerformRulePackAction(actor, "rollback")) {
    return { ok: false, reason: explainDeniedAction(actor, "rollback") };
  }
  const target = packs.find((p) => p.id === packId);
  if (!target) return { ok: false, reason: "Rule pack findes ikke." };
  if (target.status !== "retired" && target.status !== "published") {
    return { ok: false, reason: "Kun en tidligere publiceret version kan gøres aktiv igen." };
  }
  const currentlyPublished = packs.filter(
    (p) =>
      p.id !== packId &&
      p.status === "published" &&
      p.countryCode === target.countryCode &&
      (p.regionCode ?? null) === (target.regionCode ?? null),
  );
  return {
    ok: true,
    packs: packs.map((p) => {
      if (p.id === packId) return { ...p, status: "published" as const };
      if (currentlyPublished.some((c) => c.id === p.id)) return { ...p, status: "retired" as const };
      return p;
    }),
    message: `${target.countryCode} ${target.rulePackVersion} er aktiv igen for nye perioder. Historiske perioder er uændrede.`,
  };
}

export function deleteDraft(
  packs: AccountingRulePack[],
  packId: string,
  actor: RulePackActor,
): LifecycleOutcome {
  if (!canPerformRulePackAction(actor, "delete_draft")) {
    return { ok: false, reason: explainDeniedAction(actor, "delete_draft") };
  }
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: "Rule pack findes ikke." };
  if (pack.status !== "draft") {
    return { ok: false, reason: "Kun kladder kan slettes." };
  }
  return {
    ok: true,
    packs: packs.filter((p) => p.id !== packId),
    message: "Kladden er slettet.",
  };
}

export function submitForReview(
  packs: AccountingRulePack[],
  packId: string,
  actor: RulePackActor,
): LifecycleOutcome {
  if (!canPerformRulePackAction(actor, "submit_for_review")) {
    return { ok: false, reason: explainDeniedAction(actor, "submit_for_review") };
  }
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: "Rule pack findes ikke." };
  if (!canTransition(pack.status, "in_review")) {
    return { ok: false, reason: `Kan ikke sende en pakke i status “${pack.status}” til review.` };
  }
  return {
    ok: true,
    packs: packs.map((p) => (p.id === packId ? { ...p, status: "in_review" as const } : p)),
    message: "Sendt til review.",
  };
}

export function approveRulePack(
  packs: AccountingRulePack[],
  packId: string,
  actor: RulePackActor,
): LifecycleOutcome {
  if (!canPerformRulePackAction(actor, "approve")) {
    return { ok: false, reason: explainDeniedAction(actor, "approve") };
  }
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: "Rule pack findes ikke." };
  if (!canTransition(pack.status, "approved")) {
    return { ok: false, reason: "Kun en pakke i review kan godkendes." };
  }
  return {
    ok: true,
    packs: packs.map((p) => (p.id === packId ? { ...p, status: "approved" as const } : p)),
    message: "Godkendt. Kun super_admin kan publicere.",
  };
}

/**
 * The pack the accounting engine will actually use for a given date. Draft,
 * in_review, approved and retired packs are invisible to providers.
 */
export function selectActiveRulePack(
  packs: AccountingRulePack[],
  countryCode: string,
  onDate: string,
): AccountingRulePack | null {
  const candidates = packs.filter(
    (p) =>
      p.countryCode === countryCode &&
      p.status === "published" &&
      p.effectiveFrom <= onDate &&
      (!p.effectiveTo || p.effectiveTo >= onDate),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
