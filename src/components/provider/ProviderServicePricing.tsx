import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
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

const CURRENCY: Record<string, { code: string; symbol: string; factor: number; min: number }> = {
  DK: { code: "DKK", symbol: "kr.", factor: 100, min: 140 },
  SE: { code: "SEK", symbol: "kr.", factor: 100, min: 135 },
  ES: { code: "EUR", symbol: "€", factor: 100, min: 8 },
  UK: { code: "GBP", symbol: "£", factor: 100, min: 11 },
};

export function ProviderServicePricing({
  countryCode,
  onChange,
}: {
  countryCode: string;
  /** Called after a successful save/delete so the parent can refresh onboarding status. */
  onChange?: () => void;
}) {
  const { user } = useAuth();
  const currency = CURRENCY[countryCode] ?? CURRENCY.DK;
  const [rows, setRows] = useState<Record<string, PriceRow>>({});
  /** DB-persisted view for each service so we can detect deactivation. */
  const [savedRows, setSavedRows] = useState<Record<string, PriceRow>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("provider_service_prices")
      .select("service_code, amount_minor, currency, active")
      .eq("user_id", user.id)
      .then(({ data }: { data: PriceRow[] | null }) => {
        const next: Record<string, PriceRow> = {};
        for (const row of (data ?? []) as PriceRow[]) next[row.service_code] = row;
        setRows(next);
        setSavedRows(next);
      });
  }, [user]);

  const save = useCallback(
    async (serviceCode: string) => {
      if (!user) return;
      const row = rows[serviceCode];
      const wasSaved = !!savedRows[serviceCode];

      // Deactivation of a previously saved service → delete row so onboarding status flips.
      if (!row?.active) {
        if (!wasSaved) {
          toast.info("Servicen er ikke gemt endnu");
          return;
        }
        setSaving(serviceCode);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("provider_service_prices")
          .delete()
          .eq("user_id", user.id)
          .eq("service_code", serviceCode);
        setSaving(null);
        if (error) {
          toast.error(`Kunne ikke fjerne prisen: ${error.message}`);
          return;
        }
        setRows((c) => {
          const n = { ...c };
          delete n[serviceCode];
          return n;
        });
        setSavedRows((c) => {
          const n = { ...c };
          delete n[serviceCode];
          return n;
        });
        onChange?.();
        toast.success("Servicen er fjernet");
        return;
      }

      if (row.amount_minor < currency.min * currency.factor) {
        toast.error(`Prisen skal være mindst ${currency.min} ${currency.symbol} pr. time`);
        return;
      }

      setSaving(serviceCode);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("provider_service_prices")
        .upsert(
          {
            user_id: user.id,
            service_code: serviceCode,
            pricing_unit: "hour",
            amount_minor: row.amount_minor,
            currency: currency.code,
            active: true,
          },
          { onConflict: "user_id,service_code" },
        );
      setSaving(null);
      if (error) {
        toast.error(`Prisen kunne ikke gemmes: ${error.message}`);
        return;
      }
      setSavedRows((c) => ({ ...c, [serviceCode]: { ...row, currency: currency.code, active: true } }));
      onChange?.();
      toast.success("Serviceprisen er gemt");
    },
    [rows, savedRows, user, currency, onChange],
  );

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">
          Services og individuelle priser
        </div>
        <p className="mt-1 text-xs opacity-65">
          Hver service har sin egen timepris. Minimum i dit marked er {currency.min} {currency.symbol}/t.
          Mindst én aktiv, gemt servicepris kræves før du kan indsende ansøgningen.
        </p>
      </div>
      {SERVICES.map((service) => {
        const row =
          rows[service.id] ?? { service_code: service.id, amount_minor: 0, currency: currency.code, active: false };
        const wasSaved = !!savedRows[service.id];
        const deactivating = wasSaved && !row.active;
        return (
          <div
            key={service.id}
            className="grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_170px_44px]"
          >
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={row.active}
                onChange={(event) =>
                  setRows((current) => ({
                    ...current,
                    [service.id]: { ...row, active: event.target.checked },
                  }))
                }
              />
              {service.label}
              {wasSaved && row.active && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Gemt
                </span>
              )}
            </label>
            <label className="flex min-h-11 items-center overflow-hidden rounded-lg border bg-white">
              <input
                type="number"
                min={currency.min}
                step="1"
                disabled={!row.active}
                value={row.amount_minor ? row.amount_minor / currency.factor : ""}
                onChange={(event) =>
                  setRows((current) => ({
                    ...current,
                    [service.id]: {
                      ...row,
                      amount_minor: Math.round(Number(event.target.value || 0) * currency.factor),
                      currency: currency.code,
                    },
                  }))
                }
                className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none disabled:opacity-40"
                aria-label={`Timepris for ${service.label}`}
              />
              <span className="border-l px-3 text-xs font-bold">{currency.symbol}/t.</span>
            </label>
            <button
              type="button"
              onClick={() => save(service.id)}
              disabled={saving === service.id || (!row.active && !wasSaved)}
              className="grid h-11 w-11 place-items-center rounded-lg bg-[#168a7a] text-white disabled:opacity-35"
              aria-label={
                deactivating ? `Fjern gemt pris for ${service.label}` : `Gem pris for ${service.label}`
              }
              title={deactivating ? "Fjern denne service" : "Gem pris"}
            >
              {saving === service.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : deactivating ? (
                <Trash2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
