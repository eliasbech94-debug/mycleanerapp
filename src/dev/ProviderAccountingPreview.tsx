import { useMemo, useState } from "react";
import {
  ACCOUNTING_PREVIEW_CASES,
  FIXTURE_PERIOD,
  FIXTURE_RULE_PACKS,
  SALES_TAX_PREVIEW_CASE,
  fixtureLedger,
  type AccountingPreviewCase,
} from "@/dev/fixtures/accountingFixtures";
import AccountingView from "@/components/accounting/AccountingView";
import { Button } from "@/components/ui/button";
import {
  calculatePreliminaryRegistrationAmount,
  resolveAccountingJurisdiction,
} from "@/lib/accounting";

const CASES: AccountingPreviewCase[] = [...ACCOUNTING_PREVIEW_CASES, SALES_TAX_PREVIEW_CASE];

/**
 * Development-only preview. The route is not registered in production builds
 * and this module is lazy-loaded, so it never enters the production entry
 * bundle. Fixtures run through the exact same resolver and calculation engine
 * as the real page.
 */
export default function ProviderAccountingPreview() {
  const [caseId, setCaseId] = useState(CASES[0].id);
  const active = CASES.find((c) => c.id === caseId) ?? CASES[0];

  const model = useMemo(() => {
    const jurisdiction = resolveAccountingJurisdiction({
      taxResidenceCountry: active.provider.taxResidenceCountry,
      registrationCountry: active.provider.registrationCountry,
      primaryWorkCountry: active.provider.primaryWorkCountry,
      accountingPeriod: FIXTURE_PERIOD,
      availableRulePacks: FIXTURE_RULE_PACKS,
    });
    const rulePack =
      jurisdiction.status === "resolved"
        ? (FIXTURE_RULE_PACKS.find((p) => p.id === jurisdiction.rulePackId) ?? null)
        : null;
    const ledger = fixtureLedger(rulePack?.defaultCurrency ?? active.currency);
    const result = calculatePreliminaryRegistrationAmount({
      provider: active.provider,
      accountingPeriod: FIXTURE_PERIOD,
      rulePack,
      jurisdiction,
      ...ledger,
    });
    return { jurisdiction, rulePack, result };
  }, [active]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Development preview. Alle regelpakker er fiktive testdata og ikke gældende lovgivning.
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {CASES.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={item.id === caseId ? "default" : "outline"}
            onClick={() => setCaseId(item.id)}
            aria-pressed={item.id === caseId}
          >
            {item.id}
          </Button>
        ))}
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">{active.title}</h2>
        <p className="text-sm text-muted-foreground">{active.description}</p>
      </div>

      <AccountingView
        provider={active.provider}
        rulePack={model.rulePack}
        jurisdiction={model.jurisdiction}
        period={FIXTURE_PERIOD}
        result={model.result}
        monthlySummary={[
          { label: "April 2026", amountMinor: 1450000 },
          { label: "Maj 2026", amountMinor: 1680000 },
          { label: "Juni 2026", amountMinor: 0 },
        ]}
      />
    </main>
  );
}
