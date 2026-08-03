/**
 * Rule Pack Manager — data layer.
 *
 * The `accounting_rule_packs` / `accounting_rule_pack_audit` tables are
 * proposed in `scripts/staging-required/accounting/` and are NOT applied to
 * any environment yet. Until they exist the manager runs in a clearly labelled
 * local working-copy mode: everything is in memory, nothing is written, and
 * lifecycle actions are still gated by the same permission and validation
 * logic so the rules can be reviewed end to end.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import type { AccountingRulePack } from "@/lib/accounting";
import {
  ACCOUNTING_RULES_PERMISSION,
  appendAuditEntry,
  buildAuditEntry,
  canAccessRulePackModule,
  canPerformRulePackAction,
  type RulePackActor,
  type RulePackAuditAction,
  type RulePackAuditEntry,
} from "@/lib/accounting/admin";
import { FIXTURE_RULE_PACKS } from "@/dev/fixtures/accountingFixtures";

export type RulePackBackendState = "loading" | "connected" | "not_provisioned";

function seedPacks(): AccountingRulePack[] {
  // Fixtures are explicitly sampleOnly, which the validator treats as a
  // blocking error — they can be inspected and edited but never published.
  return FIXTURE_RULE_PACKS.map((pack, index) => ({
    ...pack,
    status: index === 0 ? "draft" : pack.status,
  }));
}

export function useRulePackManager() {
  const { user } = useAuth();
  const { roles } = useUserRoles();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [packs, setPacks] = useState<AccountingRulePack[]>([]);
  const [auditLog, setAuditLog] = useState<RulePackAuditEntry[]>([]);
  const [backend, setBackend] = useState<RulePackBackendState>("loading");

  const actor: RulePackActor = useMemo(
    () => ({ userId: user?.id ?? null, roles, permissions }),
    [user?.id, roles, permissions],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
      try {
        const { data, error } = await client.from("accounting_rule_packs").select("*");
        if (cancelled) return;
        if (error || !data) {
          setBackend("not_provisioned");
          setPacks(seedPacks());
        } else {
          setBackend("connected");
          setPacks(data as unknown as AccountingRulePack[]);
        }
      } catch {
        if (cancelled) return;
        setBackend("not_provisioned");
        setPacks(seedPacks());
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      if (!user?.id) {
        setPermissions([]);
        return;
      }
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => Promise<{ data: { permission: string }[] | null; error: unknown }>;
          };
        };
      };
      try {
        const { data, error } = await client
          .from("admin_permissions")
          .select("permission")
          .eq("user_id", user.id);
        if (cancelled) return;
        setPermissions(error || !data ? [] : data.map((row) => row.permission));
      } catch {
        if (!cancelled) setPermissions([]);
      }
    }
    loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const record = useCallback(
    (
      action: RulePackAuditAction,
      pack: AccountingRulePack | null,
      summary?: string,
      changes?: { field: string; before: unknown; after: unknown }[],
    ) => {
      const entry: RulePackAuditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...buildAuditEntry({
          rulePackId: pack?.id ?? null,
          countryCode: pack?.countryCode ?? null,
          rulePackVersion: pack?.rulePackVersion ?? null,
          action,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          summary,
          changes,
        }),
      };
      setAuditLog((log) => appendAuditEntry(log, entry));
      return entry;
    },
    [actor.userId, actor.roles],
  );

  const upsertPack = useCallback((pack: AccountingRulePack) => {
    setPacks((current) => {
      const exists = current.some((p) => p.id === pack.id);
      return exists ? current.map((p) => (p.id === pack.id ? pack : p)) : [...current, pack];
    });
  }, []);

  return {
    actor,
    packs,
    setPacks,
    upsertPack,
    auditLog,
    record,
    backend,
    canAccess: canAccessRulePackModule(actor),
    can: (action: Parameters<typeof canPerformRulePackAction>[1]) =>
      canPerformRulePackAction(actor, action),
    permissionName: ACCOUNTING_RULES_PERMISSION,
  };
}

export type RulePackManager = ReturnType<typeof useRulePackManager>;
