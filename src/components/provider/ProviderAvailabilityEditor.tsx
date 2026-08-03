/**
 * ProviderAvailabilityEditor — MVP calendar & availability engine (provider side).
 *
 * Weekly working hours (multi interval per weekday, local time + IANA timezone)
 * are stored in `provider_availability_rules` via `provider_set_availability_v1`.
 * Manual blocks (time off, day off, vacation) live in `provider_calendar_blocks`
 * via `provider_upsert_calendar_block_v1` / `provider_delete_calendar_block_v1`.
 *
 * Accepted bookings are blocked automatically server-side, so they are shown
 * read-only here and cannot be deleted from the calendar UI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Interval = { start: string; end: string };
type DayRule = { weekday: number; enabled: boolean; intervals: Interval[] };

type CalendarBlock = {
  id: string;
  block_type: "day_off" | "time_block" | "vacation" | "sick_leave" | "external";
  title: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  source: string;
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

const TIMEZONES = [
  "Europe/Copenhagen",
  "Europe/Stockholm",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
];

const BLOCK_LABELS: Record<CalendarBlock["block_type"], string> = {
  time_block: "Blokeret tid",
  day_off: "Fridag",
  vacation: "Ferie",
  sick_leave: "Sygdom",
  external: "Ekstern kalender",
};

const initialRules = (): DayRule[] =>
  DAYS.map(([weekday]) => ({
    weekday,
    enabled: weekday <= 5,
    intervals: [{ start: "08:00", end: "16:00" }],
  }));

const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

export function ProviderAvailabilityEditor() {
  const { user } = useAuth();
  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Copenhagen",
    [],
  );
  const [timezone, setTimezone] = useState<string>(browserTz);
  const [rules, setRules] = useState<DayRule[]>(initialRules);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [blockType, setBlockType] = useState<CalendarBlock["block_type"]>("time_block");
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const timezoneOptions = useMemo(
    () => Array.from(new Set([browserTz, ...TIMEZONES])).filter(Boolean),
    [browserTz],
  );

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: storedRules, error: rulesError }, { data: storedBlocks, error: blocksError }] =
      await Promise.all([
        supabase
          .from("provider_availability_rules")
          .select("weekday,local_start_time,local_end_time,timezone")
          .eq("provider_user_id", user.id)
          .eq("is_active", true)
          .order("weekday"),
        supabase
          .from("provider_calendar_blocks")
          .select("id,block_type,title,starts_at,ends_at,all_day,source")
          .eq("provider_user_id", user.id)
          .gte("ends_at", new Date().toISOString())
          .order("starts_at"),
      ]);

    if (rulesError || blocksError) {
      toast.error("Kalenderen kunne ikke hentes");
    } else {
      if (storedRules?.length) {
        setTimezone(String(storedRules[0].timezone || browserTz));
        setRules(
          DAYS.map(([weekday]) => {
            const rows = storedRules.filter((r) => Number(r.weekday) === weekday);
            return rows.length
              ? {
                  weekday,
                  enabled: true,
                  intervals: rows.map((r) => ({
                    start: String(r.local_start_time).slice(0, 5),
                    end: String(r.local_end_time).slice(0, 5),
                  })),
                }
              : { weekday, enabled: false, intervals: [{ start: "08:00", end: "16:00" }] };
          }),
        );
      }
      setBlocks((storedBlocks ?? []) as CalendarBlock[]);
    }
    setLoading(false);
  }, [user, browserTz]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDay = (weekday: number, patch: Partial<DayRule>) =>
    setRules((current) => current.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));

  const patchInterval = (weekday: number, index: number, patch: Partial<Interval>) =>
    setRules((current) =>
      current.map((r) =>
        r.weekday === weekday
          ? {
              ...r,
              intervals: r.intervals.map((iv, i) => (i === index ? { ...iv, ...patch } : iv)),
            }
          : r,
      ),
    );

  const addInterval = (weekday: number) =>
    setRules((current) =>
      current.map((r) =>
        r.weekday === weekday
          ? { ...r, intervals: [...r.intervals, { start: "17:00", end: "20:00" }] }
          : r,
      ),
    );

  const removeInterval = (weekday: number, index: number) =>
    setRules((current) =>
      current.map((r) =>
        r.weekday === weekday
          ? {
              ...r,
              intervals:
                r.intervals.length > 1 ? r.intervals.filter((_, i) => i !== index) : r.intervals,
            }
          : r,
      ),
    );

  async function saveRules() {
    const active = rules.filter((r) => r.enabled);
    for (const day of active) {
      if (day.intervals.some((iv) => !iv.start || !iv.end || iv.start >= iv.end)) {
        toast.error("Sluttid skal være senere end starttid");
        return;
      }
      for (let i = 0; i < day.intervals.length; i += 1) {
        for (let j = i + 1; j < day.intervals.length; j += 1) {
          if (overlaps(day.intervals[i], day.intervals[j])) {
            toast.error("To tidsrum på samme dag må ikke overlappe");
            return;
          }
        }
      }
    }

    setSaving(true);
    const { error } = await supabase.rpc("provider_set_availability_v1", {
      _timezone: timezone,
      _rules: active.flatMap((day) =>
        day.intervals.map((iv) => ({
          weekday: day.weekday,
          local_start_time: `${iv.start}:00`,
          local_end_time: `${iv.end}:00`,
          is_active: true,
        })),
      ),
    });
    setSaving(false);
    if (error) {
      toast.error(
        error.message?.includes("OVERLAPPING")
          ? "To tidsrum på samme dag må ikke overlappe"
          : "Arbejdstiderne kunne ikke gemmes",
      );
      return;
    }
    toast.success("Arbejdstider gemt");
    void load();
  }

  async function addBlock() {
    if (!from || !to || new Date(from) >= new Date(to)) {
      toast.error("Vælg et gyldigt start- og sluttidspunkt");
      return;
    }
    setAdding(true);
    const { error } = await supabase.rpc("provider_upsert_calendar_block_v1", {
      _id: undefined as unknown as string,
      _block_type: blockType,
      _title: title.trim() || (undefined as unknown as string),
      _starts_at: new Date(from).toISOString(),
      _ends_at: new Date(to).toISOString(),
      _all_day: blockType !== "time_block",
    });
    setAdding(false);
    if (error) {
      toast.error(
        error.message?.includes("BLOCK_CONFLICTS_BOOKING")
          ? "Perioden overlapper en accepteret booking"
          : "Blokeringen kunne ikke tilføjes",
      );
      return;
    }
    setFrom("");
    setTo("");
    setTitle("");
    toast.success("Blokering tilføjet");
    void load();
  }

  async function removeBlock(id: string) {
    const { error } = await supabase.rpc("provider_delete_calendar_block_v1", { _id: id });
    if (error) {
      toast.error("Blokeringen kunne ikke fjernes");
      return;
    }
    setBlocks((current) => current.filter((b) => b.id !== id));
    toast.success("Blokering fjernet");
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">Faste arbejdstider</h3>
            <p className="text-xs opacity-60">
              Kunder kan kun booke inden for disse tidsrum. Alle tider vises i din tidszone.
            </p>
          </div>
          <Button onClick={saveRules} disabled={saving} size="sm" className="min-h-[44px]">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Gem arbejdstider
          </Button>
        </div>

        <div className="mt-4 max-w-xs">
          <Label htmlFor="calendar-timezone">Tidszone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="calendar-timezone" className="min-h-[44px]">
              <SelectValue placeholder="Vælg tidszone" />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 divide-y rounded-xl border">
          {rules.map((rule) => {
            const label = DAYS.find(([day]) => day === rule.weekday)?.[1] ?? "";
            return (
              <div key={rule.weekday} className="space-y-3 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{label}</div>
                  <span className="flex min-h-[44px] min-w-[44px] items-center justify-end">
                    <Switch
                      aria-label={`Aktivér ${label}`}
                      checked={rule.enabled}
                      onCheckedChange={(enabled) => patchDay(rule.weekday, { enabled })}
                    />
                  </span>
                </div>

                {rule.enabled ? (
                  <div className="space-y-2">
                    {rule.intervals.map((iv, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label={`${label} start ${index + 1}`}
                          type="time"
                          step={900}
                          value={iv.start}
                          onChange={(e) =>
                            patchInterval(rule.weekday, index, { start: e.target.value })
                          }
                          className="min-h-[44px] max-w-32"
                        />
                        <span className="text-sm opacity-50">til</span>
                        <Input
                          aria-label={`${label} slut ${index + 1}`}
                          type="time"
                          step={900}
                          value={iv.end}
                          onChange={(e) =>
                            patchInterval(rule.weekday, index, { end: e.target.value })
                          }
                          className="min-h-[44px] max-w-32"
                        />
                        {rule.intervals.length > 1 && (
                          <Button
                            aria-label={`Fjern tidsrum ${index + 1} for ${label}`}
                            size="icon"
                            variant="ghost"
                            className="min-h-[44px] min-w-[44px]"
                            onClick={() => removeInterval(rule.weekday, index)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => addInterval(rule.weekday)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Tilføj tidsrum
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm opacity-50">Ikke tilgængelig</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t pt-6">
        <h3 className="font-semibold">Fridage, ferie og blokeret tid</h3>
        <p className="text-xs opacity-60">
          Bloker perioder, hvor du ikke kan tage imod bookinger. Accepterede bookinger blokeres
          automatisk.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[160px_1fr_1fr_auto] lg:items-end">
          <div>
            <Label htmlFor="block-type">Type</Label>
            <Select
              value={blockType}
              onValueChange={(v) => setBlockType(v as CalendarBlock["block_type"])}
            >
              <SelectTrigger id="block-type" className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time_block">Blokeret tid</SelectItem>
                <SelectItem value="day_off">Fridag</SelectItem>
                <SelectItem value="vacation">Ferie</SelectItem>
                <SelectItem value="sick_leave">Sygdom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="block-from">Fra</Label>
            <Input
              id="block-from"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <Label htmlFor="block-to">Til</Label>
            <Input
              id="block-to"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <Button
            onClick={addBlock}
            disabled={adding}
            variant="outline"
            className="min-h-[44px]"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Tilføj
          </Button>
        </div>

        <div className="mt-3 max-w-md">
          <Label htmlFor="block-title">Note (valgfri)</Label>
          <Input
            id="block-title"
            value={title}
            maxLength={120}
            placeholder="F.eks. sommerferie"
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-[44px]"
          />
        </div>

        <div className="mt-4 space-y-2">
          {blocks.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-5 text-center text-sm opacity-60">
              <CalendarOff className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
              Ingen kommende fridage eller blokeringer.
            </div>
          )}
          {blocks.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <span className="min-w-0">
                <strong>{BLOCK_LABELS[item.block_type] ?? "Blokeret"}</strong>
                {item.title ? ` · ${item.title}` : ""}
                <span className="block opacity-70">
                  {new Date(item.starts_at).toLocaleString("da-DK")} –{" "}
                  {new Date(item.ends_at).toLocaleString("da-DK")}
                </span>
              </span>
              {item.source === "manual" ? (
                <Button
                  aria-label="Fjern blokering"
                  size="icon"
                  variant="ghost"
                  className="min-h-[44px] min-w-[44px]"
                  onClick={() => removeBlock(item.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <span className="text-xs opacity-60">Automatisk</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default ProviderAvailabilityEditor;
