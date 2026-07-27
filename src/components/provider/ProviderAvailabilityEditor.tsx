import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type DayRule = {
  weekday: number;
  enabled: boolean;
  starts_at: string;
  ends_at: string;
};

type TimeOff = {
  id: string;
  starts_at: string;
  ends_at: string;
};

const DAYS = [
  [1, "Mandag"],
  [2, "Tirsdag"],
  [3, "Onsdag"],
  [4, "Torsdag"],
  [5, "Fredag"],
  [6, "Lørdag"],
  [7, "Søndag"],
] as const;

const initialRules = (): DayRule[] =>
  DAYS.map(([weekday]) => ({
    weekday,
    enabled: weekday <= 5,
    starts_at: "08:00",
    ends_at: "16:00",
  }));

const localInputValue = (iso: string) => {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

export function ProviderAvailabilityEditor() {
  const { user } = useAuth();
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Copenhagen",
    [],
  );
  const [rules, setRules] = useState<DayRule[]>(initialRules);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: storedRules, error: rulesError }, { data: blocks, error: blocksError }] =
      await Promise.all([
        (supabase.from("provider_availability_rules") as any)
          .select("weekday,starts_at,ends_at")
          .eq("provider_user_id", user.id)
          .eq("is_active", true)
          .order("weekday"),
        (supabase.from("provider_calendar_blocks") as any)
          .select("id,starts_at,ends_at")
          .eq("provider_user_id", user.id)
          .eq("source", "time_off")
          .gte("ends_at", new Date().toISOString())
          .order("starts_at"),
      ]);

    if (rulesError || blocksError) {
      toast.error("Kalenderen kunne ikke hentes");
    } else {
      if (storedRules?.length) {
        const next = initialRules().map((day) => {
          const row = storedRules.find((r: any) => r.weekday === day.weekday);
          return row
            ? {
                weekday: day.weekday,
                enabled: true,
                starts_at: String(row.starts_at).slice(0, 5),
                ends_at: String(row.ends_at).slice(0, 5),
              }
            : { ...day, enabled: false };
        });
        setRules(next);
      }
      setTimeOff((blocks ?? []) as TimeOff[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const patchDay = (weekday: number, patch: Partial<DayRule>) => {
    setRules((current) =>
      current.map((rule) => (rule.weekday === weekday ? { ...rule, ...patch } : rule)),
    );
  };

  async function saveRules() {
    const enabled = rules.filter((rule) => rule.enabled);
    if (enabled.some((rule) => rule.starts_at >= rule.ends_at)) {
      toast.error("Sluttid skal være senere end starttid");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.rpc as any)("replace_provider_availability_rules", {
      _timezone: timezone,
      _rules: enabled.map(({ weekday, starts_at, ends_at }) => ({
        weekday,
        starts_at,
        ends_at,
      })),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Arbejdstiderne kunne ikke gemmes");
      return;
    }
    toast.success("Arbejdstider gemt");
    load();
  }

  async function addTimeOff() {
    if (!from || !to || new Date(from) >= new Date(to)) {
      toast.error("Vælg et gyldigt start- og sluttidspunkt");
      return;
    }
    setAdding(true);
    const { error } = await (supabase.rpc as any)("add_provider_time_off", {
      _starts_at: new Date(from).toISOString(),
      _ends_at: new Date(to).toISOString(),
    });
    setAdding(false);
    if (error) {
      toast.error(error.message || "Fraværet kunne ikke tilføjes");
      return;
    }
    setFrom("");
    setTo("");
    toast.success("Fravær tilføjet");
    load();
  }

  async function removeTimeOff(id: string) {
    const { error } = await (supabase.rpc as any)("remove_provider_time_off", {
      _block_id: id,
    });
    if (error) {
      toast.error(error.message || "Fraværet kunne ikke fjernes");
      return;
    }
    setTimeOff((current) => current.filter((item) => item.id !== id));
    toast.success("Fravær fjernet");
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Faste arbejdstider</h3>
            <p className="text-xs opacity-60">
              Kunder kan kun anmode om tider inden for disse intervaller. Tidszone: {timezone}
            </p>
          </div>
          <Button onClick={saveRules} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Gem arbejdstider
          </Button>
        </div>

        <div className="mt-4 divide-y rounded-xl border">
          {rules.map((rule) => {
            const label = DAYS.find(([day]) => day === rule.weekday)?.[1];
            return (
              <div
                key={rule.weekday}
                className="grid grid-cols-[1fr_auto] items-center gap-3 p-3 sm:grid-cols-[150px_1fr_auto]"
              >
                <div className="font-medium">{label}</div>
                <div className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                  {rule.enabled ? (
                    <>
                      <Input
                        aria-label={`${label} start`}
                        type="time"
                        step={3600}
                        value={rule.starts_at}
                        onChange={(event) =>
                          patchDay(rule.weekday, { starts_at: event.target.value })
                        }
                        className="max-w-32"
                      />
                      <span className="text-sm opacity-50">til</span>
                      <Input
                        aria-label={`${label} slut`}
                        type="time"
                        step={3600}
                        value={rule.ends_at}
                        onChange={(event) =>
                          patchDay(rule.weekday, { ends_at: event.target.value })
                        }
                        className="max-w-32"
                      />
                    </>
                  ) : (
                    <span className="text-sm opacity-50">Ikke tilgængelig</span>
                  )}
                </div>
                <Switch
                  aria-label={`Aktivér ${label}`}
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => patchDay(rule.weekday, { enabled })}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="font-semibold">Ferie og fravær</h3>
        <p className="text-xs opacity-60">
          Bloker perioder, hvor du ikke ønsker bookinganmodninger.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="time-off-from">Fra</Label>
            <Input
              id="time-off-from"
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="time-off-to">Til</Label>
            <Input
              id="time-off-to"
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={addTimeOff} disabled={adding} variant="outline">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tilføj
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {timeOff.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-5 text-center text-sm opacity-60">
              <CalendarOff className="mx-auto mb-2 h-5 w-5" />
              Ingen kommende fraværsperioder.
            </div>
          )}
          {timeOff.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <span>
                {new Date(item.starts_at).toLocaleString("da-DK")} –{" "}
                {new Date(item.ends_at).toLocaleString("da-DK")}
              </span>
              <Button
                aria-label="Fjern fravær"
                size="icon"
                variant="ghost"
                onClick={() => removeTimeOff(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950">
        Eksterne kalendere kobles på i næste fase. MyCleaner gemmer kun optaget/ledig
        og aldrig titler, deltagere, adresser eller noter fra din private kalender.
      </div>
    </div>
  );
}

