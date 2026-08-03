import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountingRulePack, RulePackStatus } from "@/lib/accounting";
import {
  isRulePackExpired,
  validateRulePack,
  RULE_PACK_STATUS_LABELS,
} from "@/lib/accounting/admin";
import { RulePackStatusBadge, countryFlag } from "./RulePackStatusBadge";

const STATUS_ORDER: RulePackStatus[] = ["published", "draft", "in_review", "approved", "retired"];

export interface DashboardTotals {
  byStatus: Record<RulePackStatus, number>;
  warnings: number;
  blockingErrors: number;
  verifiedSources: number;
  expired: number;
}

export function computeDashboardTotals(packs: AccountingRulePack[]): DashboardTotals {
  const byStatus: Record<RulePackStatus, number> = {
    draft: 0,
    in_review: 0,
    approved: 0,
    published: 0,
    retired: 0,
  };
  let warnings = 0;
  let blockingErrors = 0;
  let verifiedSources = 0;
  let expired = 0;

  for (const pack of packs) {
    byStatus[pack.status] += 1;
    const report = validateRulePack(pack, { otherPacks: packs });
    warnings += report.warnings.length;
    blockingErrors += report.blockingErrors.length;
    verifiedSources += report.verifiedSourceCount;
    if (isRulePackExpired(pack)) expired += 1;
  }

  return { byStatus, warnings, blockingErrors, verifiedSources, expired };
}

export default function RulePackDashboard({ packs }: { packs: AccountingRulePack[] }) {
  const { t } = useTranslation("admin");
  const totals = useMemo(() => computeDashboardTotals(packs), [packs]);

  const coverage = useMemo(() => {
    const map = new Map<string, RulePackStatus>();
    for (const pack of packs) {
      const current = map.get(pack.countryCode);
      const rank = (s: RulePackStatus) => STATUS_ORDER.indexOf(s);
      if (current === undefined || rank(pack.status) < rank(current)) {
        map.set(pack.countryCode, pack.status);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [packs]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("rules.dashboard.rulePacksTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3">
            {STATUS_ORDER.map((status) => (
              <div key={status} className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-xs text-muted-foreground">{RULE_PACK_STATUS_LABELS[status]}</dt>
                <dd className="text-2xl font-semibold text-foreground">{totals.byStatus[status]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("rules.dashboard.coverageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {coverage.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("rules.dashboard.noCountries")}</p>
          ) : (
            <ul className="space-y-2">
              {coverage.map(([country, status]) => (
                <li key={country} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <span aria-hidden>{countryFlag(country)}</span>
                    {country}
                  </span>
                  <RulePackStatusBadge status={status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("rules.dashboard.validationTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("rules.dashboard.warnings")}</span>
              <span className="font-medium text-foreground" data-testid="total-warnings">
                {totals.warnings}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("rules.dashboard.blockingErrors")}</span>
              <span className="font-medium text-destructive" data-testid="total-blocking">
                {totals.blockingErrors}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("rules.dashboard.verifiedSources")}</span>
              <span className="font-medium text-foreground">{totals.verifiedSources}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">{t("rules.dashboard.expiredPacks")}</span>
              <span className="font-medium text-foreground">{totals.expired}</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
