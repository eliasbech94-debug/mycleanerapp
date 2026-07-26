/**
 * MarketMenu — compact market + language selector for the marketplace
 * navbar. It's a thin composition around the SAME sources of truth used
 * everywhere else:
 *   - country / market  → `useActiveMarket` (`setMarket`)
 *   - UI language       → `setManualLanguage` from `@/i18n`
 * No new stored country value is introduced. Options are restricted to
 * the currently-active EU markets from `@/lib/markets`.
 */
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { MARKETS } from "@/lib/markets";
import { setManualLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";

const OFFERED = new Set(["DK", "SE", "DE", "ES", "GB"]);

export function MarketMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { t, i18n } = useTranslation("common");
  const { market, setMarket } = useActiveMarket();
  const offered = MARKETS.filter((m) => OFFERED.has(m.code));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-[hsl(var(--mkt-ink))] hover:bg-[hsl(var(--mkt-surface-muted))]"
          aria-label={t("country.label", "Country")}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{market.flag} {market.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel>{t("country.label", "Country")}</DropdownMenuLabel>
        {offered.map((m) => (
          <DropdownMenuItem key={m.code} onClick={() => setMarket(m)}>
            <span className="mr-2">{m.flag}</span> {m.label}
            {m.code === market.code ? <span className="ml-auto text-xs text-[hsl(var(--mkt-ink-soft))]">•</span> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("language.label", "Language")}</DropdownMenuLabel>
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onClick={() => setManualLanguage(lng as SupportedLanguage)}
          >
            {t(`language.${lng}`, lng)}
            {i18n.language?.slice(0, 2) === lng ? <span className="ml-auto text-xs text-[hsl(var(--mkt-ink-soft))]">•</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
