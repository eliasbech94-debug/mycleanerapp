import { useState } from "react";
import { Helmet } from "react-helmet-async";
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
  const manager = useRulePackManager();
  const [selected, setSelected] = useState<AccountingRulePack | null>(null);

  if (!manager.canAccess) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold text-foreground">Ingen adgang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rule Pack Manager kræver rollen super_admin eller en admin med rettigheden
          «{manager.permissionName}».
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <Helmet>
        <title>Rule Pack Manager | MyCleaner Admin</title>
        <meta name="description" content="Administrér internationale regnskabsregler pr. land i MyCleaner." />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">International Rule Pack Manager</h1>
          <p className="text-sm text-muted-foreground">
            Landespecifikke regnskabsregler. Ingen regler er hardcodet i koden.
          </p>
        </div>
        <Button
          disabled={!manager.can("create")}
          onClick={() => {
            const pack = createEmptyRulePack(`draft-${Date.now()}`);
            manager.upsertPack(pack);
            manager.record("created", pack, "Ny rule pack oprettet som draft.");
            setSelected(pack);
            toast.success("Ny draft oprettet.");
          }}
        >
          Ny rule pack
        </Button>
      </header>

      {manager.backend === "not_provisioned" && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Backend-tabellerne for rule packs er endnu ikke oprettet. Manageren kører som lokal
            arbejdskopi med testdata — intet gemmes, og intet publiceres til providere.
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
