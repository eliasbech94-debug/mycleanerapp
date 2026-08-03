import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountingRulePack, RulePackStatus } from "@/lib/accounting";
import { validateRulePack, RULE_PACK_STATUS_LABELS } from "@/lib/accounting/admin";
import { RulePackStatusBadge, countryFlag } from "./RulePackStatusBadge";

const STATUSES: RulePackStatus[] = ["draft", "in_review", "approved", "published", "retired"];

export interface RulePackTableProps {
  packs: AccountingRulePack[];
  onOpen: (pack: AccountingRulePack) => void;
}

export default function RulePackTable({ packs, onOpen }: RulePackTableProps) {
  const { t } = useTranslation("admin");
  const [country, setCountry] = useState("");
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<RulePackStatus | "">("");
  const [activeOn, setActiveOn] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [hasWarnings, setHasWarnings] = useState(false);
  const [hasBlocking, setHasBlocking] = useState(false);

  const rows = useMemo(
    () =>
      packs
        .map((pack) => ({ pack, report: validateRulePack(pack, { otherPacks: packs }) }))
        .filter(({ pack, report }) => {
          if (country && !pack.countryCode.toLowerCase().includes(country.toLowerCase())) return false;
          if (version && !pack.rulePackVersion.toLowerCase().includes(version.toLowerCase())) return false;
          if (status && pack.status !== status) return false;
          if (activeOn) {
            const from = pack.effectiveFrom || "9999-12-31";
            if (from > activeOn) return false;
            if (pack.effectiveTo && pack.effectiveTo < activeOn) return false;
          }
          if (needsVerification && report.verifiedSourceCount > 0) return false;
          if (hasWarnings && report.warnings.length === 0) return false;
          if (hasBlocking && report.blockingErrors.length === 0) return false;
          return true;
        }),
    [packs, country, version, status, activeOn, needsVerification, hasWarnings, hasBlocking],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-country" className="text-xs text-muted-foreground">{t("rules.table.countryLabel")}</label>
            <Input id="filter-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="DK" />
          </div>
          <div>
            <label htmlFor="filter-status" className="text-xs text-muted-foreground">{t("rules.table.statusLabel")}</label>
            <select
              id="filter-status"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as RulePackStatus | "")}
            >
              <option value="">{t("rules.table.all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{RULE_PACK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-version" className="text-xs text-muted-foreground">{t("rules.table.versionLabel")}</label>
            <Input id="filter-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026.1" />
          </div>
          <div>
            <label htmlFor="filter-active" className="text-xs text-muted-foreground">{t("rules.table.activeDateLabel")}</label>
            <Input id="filter-active" type="date" value={activeOn} onChange={(e) => setActiveOn(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-4 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={needsVerification} onCheckedChange={(v) => setNeedsVerification(v === true)} />
              {t("rules.table.needsVerification")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={hasWarnings} onCheckedChange={(v) => setHasWarnings(v === true)} />
              {t("rules.table.hasWarnings")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={hasBlocking} onCheckedChange={(v) => setHasBlocking(v === true)} />
              {t("rules.table.hasBlocking")}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Desktop: table. Mobile: cards, so nothing scrolls sideways. */}
      <div className="hidden md:block">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rules.table.headers.country")}</TableHead>
                <TableHead>{t("rules.table.headers.region")}</TableHead>
                <TableHead>{t("rules.table.headers.version")}</TableHead>
                <TableHead>{t("rules.table.headers.status")}</TableHead>
                <TableHead>{t("rules.table.headers.from")}</TableHead>
                <TableHead>{t("rules.table.headers.to")}</TableHead>
                <TableHead>{t("rules.table.headers.lastChange")}</TableHead>
                <TableHead>{t("rules.table.headers.verified")}</TableHead>
                <TableHead>{t("rules.table.headers.owner")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ pack, report }) => (
                <TableRow
                  key={pack.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(pack)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen(pack);
                  }}
                >
                  <TableCell>
                    <span aria-hidden className="mr-1">{countryFlag(pack.countryCode)}</span>
                    {pack.countryCode}
                  </TableCell>
                  <TableCell>{pack.regionCode ?? "—"}</TableCell>
                  <TableCell>{pack.rulePackVersion}</TableCell>
                  <TableCell><RulePackStatusBadge status={pack.status} /></TableCell>
                  <TableCell>{pack.effectiveFrom || "—"}</TableCell>
                  <TableCell>{pack.effectiveTo ?? "—"}</TableCell>
                  <TableCell>{pack.verifiedAt ?? "—"}</TableCell>
                  <TableCell>{report.verifiedSourceCount > 0 ? t("rules.table.yes") : t("rules.table.no")}</TableCell>
                  <TableCell className="max-w-[10rem] truncate">{pack.verifiedBy ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {t("rules.table.noMatches")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map(({ pack, report }) => (
          <Card key={pack.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  <span aria-hidden className="mr-1">{countryFlag(pack.countryCode)}</span>
                  {pack.countryCode} {pack.rulePackVersion}
                </span>
                <RulePackStatusBadge status={pack.status} />
              </div>
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-muted-foreground">{t("rules.table.headers.from")}</dt>
                <dd className="text-foreground">{pack.effectiveFrom || "—"}</dd>
                <dt className="text-muted-foreground">{t("rules.table.headers.to")}</dt>
                <dd className="text-foreground">{pack.effectiveTo ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("rules.table.headers.verified")}</dt>
                <dd className="text-foreground">{report.verifiedSourceCount > 0 ? t("rules.table.yes") : t("rules.table.no")}</dd>
              </dl>
              <Button size="sm" className="w-full" onClick={() => onOpen(pack)}>
                {t("rules.table.openPack")}
              </Button>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("rules.table.noMatches")}</p>
        )}
      </div>
    </div>
  );
}
