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
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { setManualLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";

// Launch markets we communicate about. Whether each one is bookable is
// resolved from the server-managed lifecycle status — never hardcoded here.
const LAUNCH_MARKETS = new Set(["DK", "SE", "DE", "ES", "GB"]);

export function MarketMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { t, i18n } = useTranslation("common");
  const { market, setMarket } = useActiveMarket();
  const { isBookable } = useMarketStatus();
  const offered = MARKETS.filter((m) => LAUNCH_MARKETS.has(m.code));

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
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel>{t("country.label", "Country")}</DropdownMenuLabel>
        {offered.map((m) => {
          const live = isBookable(m.code);
          return (
            <DropdownMenuItem
              key={m.code}
              data-testid={`market-option-${m.code}`}
              data-market-status={live ? "active" : "coming_soon"}
              disabled={!live}
              aria-disabled={!live}
              onSelect={(e) => {
                if (!live) { e.preventDefault(); return; }
                setMarket(m);
              }}
            >
              <span className="mr-2">{m.flag}</span> {m.label}
              {!live && (
                <span className="ml-auto rounded-full bg-[hsl(var(--mkt-surface-muted))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--mkt-ink-soft))]">
                  {t("country.coming_soon", "Kommer snart")}
                </span>
              )}
              {live && m.code === market.code ? <span className="ml-auto text-xs text-[hsl(var(--mkt-ink-soft))]">•</span> : null}
            </DropdownMenuItem>
          );
        })}

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
