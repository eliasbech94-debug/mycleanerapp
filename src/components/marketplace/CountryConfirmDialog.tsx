/**
 * CountryConfirmDialog — first-visit confirmation of the marketplace's
 * suggested country. The suggestion comes from `ActiveMarketContext`
 * (locale / neutral fallback) — NEVER from geolocation. The dialog
 * only records whether the user has acknowledged the suggestion; the
 * canonical country continues to live in `ActiveMarketContext` (via
 * its existing `setMarket` / `clearExplicit` API).
 *
 * Supported options are the currently-active EU markets defined in
 * `@/lib/markets` — no new countries are introduced here.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { MARKETS, marketByCode } from "@/lib/markets";

const ACK_KEY = "mc.market.confirmed";
// The five markets the product spec lists as "supported marketplace options".
const OFFERED_CODES = new Set(["DK", "SE", "DE", "ES", "GB"]);

function hasAcknowledged(): boolean {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(ACK_KEY) === "1"; }
  catch { return false; }
}

function acknowledge() {
  try { localStorage.setItem(ACK_KEY, "1"); } catch { /* ignore */ }
}

export function CountryConfirmDialog() {
  const { t, i18n } = useTranslation("common");
  const { market, source, setMarket } = useActiveMarket();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(market.code);

  /** Country names in the active UI language — never English fallbacks. */
  const countryName = useMemo(() => {
    let display: Intl.DisplayNames | null = null;
    try {
      display = new Intl.DisplayNames([i18n.language || "en"], { type: "region" });
    } catch { display = null; }
    return (code: string, fallback: string) => {
      if (!/^[A-Z]{2}$/.test(code)) return fallback;
      try { return display?.of(code) ?? fallback; } catch { return fallback; }
    };
  }, [i18n.language]);

  const offered = useMemo(
    () => MARKETS.filter((m) => OFFERED_CODES.has(m.code)),
    [],
  );

  useEffect(() => {
    // Never prompt users who already made an explicit choice or have a
    // saved profile country — they aren't first-visit visitors.
    if (source === "explicit" || source === "user_profile" || source === "booking_address") return;
    if (hasAcknowledged()) return;
    setSelected(market.code);
    // Defer to avoid layering over Route transitions.
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [source, market.code]);

  function confirm() {
    const next = marketByCode(selected);
    if (next) setMarket(next);
    acknowledge();
    setOpen(false);
  }

  function dismiss() {
    // A returning-but-unacknowledged visitor can dismiss safely. We still
    // record the acknowledgement so we don't keep interrupting them.
    acknowledge();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent
        className="w-[min(100vw-1.5rem,28rem)] max-w-none border-white/30 bg-background/85 shadow-2xl backdrop-blur-xl sm:w-[min(100vw-3rem,28rem)]"
        data-surface="marketplace"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1.25rem)",
          paddingTop: "max(env(safe-area-inset-top, 0px), 1.25rem)",
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-[20px] text-[hsl(var(--mkt-ink))]">
            {t("country_confirm.title", "Are you in {{country}}?", { country: countryName(market.code, market.label) })}
          </DialogTitle>
          <DialogDescription className="text-[hsl(var(--mkt-ink-muted))]">
            {t(
              "country_confirm.body",
              "You are visiting MyCleaner {{country}}. Prices will be shown in {{currency}} and we'll display cleaners available in {{country}}.",
              { country: countryName(market.code, market.label), currency: market.currency },
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <label className="mb-1.5 block text-[13px] font-medium text-[hsl(var(--mkt-ink-muted))]">
            {t("country_confirm.choose", "Choose another country")}
          </label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offered.map((m) => (
                <SelectItem key={m.code} value={m.code}>
                  <span className="mr-2">{m.flag}</span>{countryName(m.code, m.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="outline" onClick={dismiss} className="h-11 w-full sm:w-auto">
            {t("actions.close", "Close")}
          </Button>
          <Button
            onClick={confirm}
            className="h-11 w-full bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] hover:bg-[hsl(var(--mkt-brand-hover))] sm:w-auto"
          >
            {selected === market.code
              ? t("country_confirm.continue", "Continue in {{country}}", { country: countryName(market.code, market.label) })
              : t("country_confirm.switch", "Switch to {{country}}", { country: countryName(selected, marketByCode(selected)?.label ?? selected) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
