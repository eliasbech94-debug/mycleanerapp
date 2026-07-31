import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { AccountingRulePack } from "@/lib/accounting";
import { createEmptyRulePack } from "@/lib/accounting/admin";
import { useRulePackManager } from "@/hooks/useRulePackManager";
import RulePackDashboard from "@/components/admin/accounting-rules/RulePackDashboard";
import RulePackTable from "@/components/admin/accounting-rules/RulePackTable";
import RulePackEditor from "@/components/admin/accounting-rules/RulePackEditor";

export default function AdminAccountingRules() {
  const { t } = useTranslation("admin");
  const manager = useRulePackManager();
  const [selected, setSelected] = useState<AccountingRulePack | null>(null);

  if (!manager.canAccess) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold text-foreground">{t("pages.adminAccountingRules.noAccessTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("pages.adminAccountingRules.noAccessBody", { permission: manager.permissionName })}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("pages.adminAccountingRules.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("pages.adminAccountingRules.subtitle")}
          </p>
        </div>
        <Button
          disabled={!manager.can("create")}
          onClick={() => {
            const pack = createEmptyRulePack(`draft-${Date.now()}`);
            manager.upsertPack(pack);
            manager.record("rule_pack_created", pack, t("pages.adminAccountingRules.createdLog"));
            setSelected(pack);
            toast.success(t("pages.adminAccountingRules.createdToast"));
          }}
        >
          {t("pages.adminAccountingRules.newRulePack")}
        </Button>
      </header>

      {manager.backend === "not_provisioned" && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t("pages.adminAccountingRules.notProvisioned")}
          </CardContent>
        </Card>
      )}

      {selected ? (
        <RulePackEditor
          pack={selected}
          manager={manager}
          onClose={() => setSelected(null)}
        />
      ) : (
        <>
          <RulePackDashboard packs={manager.packs} />
          <RulePackTable packs={manager.packs} onOpen={setSelected} />
        </>
      )}
    </main>
  );
}
