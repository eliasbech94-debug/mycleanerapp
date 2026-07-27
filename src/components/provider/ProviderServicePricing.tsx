import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SERVICES = [
  { id: "home_cleaning", label: "Almindelig rengøring" },
  { id: "deep_cleaning", label: "Hovedrengøring" },
  { id: "move_out_cleaning", label: "Flytterengøring" },
  { id: "office_cleaning", label: "Erhvervsrengøring" },
  { id: "window_cleaning", label: "Vinduespudsning" },
] as const;

type PriceRow = { service_code: string; amount_minor: number; currency: string; active: boolean };

const CURRENCY: Record<string, { code: string; symbol: string; factor: number }> = {
  DK: { code: "DKK", symbol: "kr.", factor: 100 },
  SE: { code: "SEK", symbol: "kr.", factor: 100 },
  ES: { code: "EUR", symbol: "€", factor: 100 },
  UK: { code: "GBP", symbol: "£", factor: 100 },
};

export function ProviderServicePricing({ countryCode }: { countryCode: string }) {
  const { user } = useAuth();
  const currency = CURRENCY[countryCode] ?? CURRENCY.DK;
  const [rows, setRows] = useState<Record<string, PriceRow>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("provider_service_prices")
      .select("service_code, amount_minor, currency, active")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const next: Record<string, PriceRow> = {};
        for (const row of (data ?? []) as PriceRow[]) next[row.service_code] = row;
        setRows(next);
      });
  }, [user]);

  const save = useCallback(async (serviceCode: string) => {
    if (!user) return;
    const row = rows[serviceCode];
    if (!row?.active || row.amount_minor <= 0) {
      toast.error("Vælg servicen og indtast en gyldig pris");
      return;
    }
    setSaving(serviceCode);
    const { error } = await supabase.from("provider_service_prices").upsert({
      user_id: user.id,
      service_code: serviceCode,
      pricing_unit: "hour",
      amount_minor: row.amount_minor,
      currency: currency.code,
      active: true,
    }, { onConflict: "user_id,service_code" });
    setSaving(null);
    if (error) toast.error(`Prisen kunne ikke gemmes: ${error.message}`);
    else toast.success("Serviceprisen er gemt");
  }, [rows, user, currency.code]);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">Services og individuelle priser</div>
        <p className="mt-1 text-xs opacity-65">Hver service har sin egen timepris. Du kan ændre priserne senere.</p>
      </div>
      {SERVICES.map((service) => {
        const row = rows[service.id] ?? { service_code: service.id, amount_minor: 0, currency: currency.code, active: false };
        return (
          <div key={service.id} className="grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_170px_44px]">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={row.active}
                onChange={(event) => setRows((current) => ({
                  ...current,
                  [service.id]: { ...row, active: event.target.checked },
                }))}
              />
              {service.label}
            </label>
            <label className="flex min-h-11 items-center overflow-hidden rounded-lg border bg-white">
              <input
                type="number"
                min="1"
                step="1"
                disabled={!row.active}
                value={row.amount_minor ? row.amount_minor / currency.factor : ""}
                onChange={(event) => setRows((current) => ({
                  ...current,
                  [service.id]: {
                    ...row,
                    amount_minor: Math.round(Number(event.target.value || 0) * currency.factor),
                    currency: currency.code,
                  },
                }))}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none disabled:opacity-40"
                aria-label={`Timepris for ${service.label}`}
              />
              <span className="border-l px-3 text-xs font-bold">{currency.symbol}/t.</span>
            </label>
            <button
              type="button"
              onClick={() => save(service.id)}
              disabled={!row.active || saving === service.id}
              className="grid h-11 w-11 place-items-center rounded-lg bg-[#168a7a] text-white disabled:opacity-35"
              aria-label={`Gem pris for ${service.label}`}
            >
              {saving === service.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
