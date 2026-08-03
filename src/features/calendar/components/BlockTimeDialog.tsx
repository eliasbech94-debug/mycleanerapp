import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CalendarBlockRow } from "../useProviderCalendar";
import { isoDate } from "../time";

type BlockType = CalendarBlockRow["block_type"];

const TYPES: { value: BlockType; label: string; hint: string }[] = [
  { value: "time_block", label: "Utilgængelig / pause", hint: "Blokerer bookinger i perioden" },
  { value: "day_off", label: "Fridag", hint: "Hele dagen blokeres" },
  { value: "vacation", label: "Ferie", hint: "Blokerer hele perioden" },
  { value: "sick_leave", label: "Sygdom", hint: "Blokerer hele perioden" },
];

function humanBlockError(raw?: string): string {
  const m = (raw || "").toUpperCase();
  if (m.includes("BLOCK_CONFLICTS_BOOKING")) {
    return "Perioden overlapper en accepteret booking. Vælg et andet tidsrum — bookingen bliver ikke overskrevet.";
  }
  if (m.includes("OVERLAP")) return "Perioden overlapper en anden blokering. Justér tidsrummet.";
  return "Blokeringen kunne ikke gemmes. Prøv igen om lidt.";
}

/**
 * Block-time dialog (desktop) / full-width sheet-style dialog (mobile).
 * Writes exclusively through `provider_upsert_calendar_block_v1`; private
 * titles and notes stay on the provider side and are never customer-facing.
 */
export function BlockTimeDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: CalendarBlockRow | null;
  defaultDate?: Date;
}) {
  const [type, setType] = useState<BlockType>("time_block");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = defaultDate ? isoDate(defaultDate) : isoDate(new Date());
    if (editing) {
      const s = new Date(editing.starts_at);
      const e = new Date(editing.ends_at);
      setType(editing.block_type);
      setTitle(editing.title ?? "");
      setAllDay(editing.all_day);
      setStartDate(isoDate(s));
      setEndDate(isoDate(e));
      setStartTime(`${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`);
      setEndTime(`${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`);
    } else {
      setType("time_block");
      setTitle("");
      setNote("");
      setAllDay(false);
      setStartDate(base);
      setEndDate(base);
      setStartTime("09:00");
      setEndTime("12:00");
    }
  }, [open, editing, defaultDate]);

  const readOnly = editing?.block_type === "external" || editing?.source === "external";

  async function save() {
    const start = new Date(`${startDate}T${allDay ? "00:00" : startTime}:00`);
    const end = allDay
      ? new Date(`${endDate}T23:59:00`)
      : new Date(`${endDate}T${endTime}:00`);
    if (!startDate || !endDate || Number.isNaN(+start) || Number.isNaN(+end) || start >= end) {
      toast.error("Vælg et gyldigt start- og sluttidspunkt.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("provider_upsert_calendar_block_v1", {
      _id: (editing?.id ?? null) as unknown as string,
      _block_type: type,
      _title: (title.trim() || undefined) as unknown as string,
      _starts_at: start.toISOString(),
      _ends_at: end.toISOString(),
      _all_day: allDay || type !== "time_block",
    });
    setSaving(false);
    if (error) {
      toast.error(humanBlockError(error.message));
      return;
    }
    toast.success(editing ? "Blokering opdateret" : "Blokering tilføjet");
    onOpenChange(false);
    onSaved();
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.rpc("provider_delete_calendar_block_v1", { _id: editing.id });
    setSaving(false);
    setConfirmDelete(false);
    if (error) {
      toast.error("Blokeringen kunne ikke fjernes. Prøv igen om lidt.");
      return;
    }
    toast.success("Blokering fjernet");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Rediger blokering" : "Bloker tid"}</DialogTitle>
          <DialogDescription>
            Blokeret tid fjerner tidspunkter fra kundernes bookingflow. Titel og note er private.
          </DialogDescription>
        </DialogHeader>

        {readOnly ? (
          <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            Begivenheden kommer fra en ekstern kalender og kan ikke redigeres her.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="block-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as BlockType)}>
                <SelectTrigger id="block-type" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {TYPES.find((t) => t.value === type)?.hint}
              </p>
            </div>

            <div>
              <Label htmlFor="block-title">Titel (privat)</Label>
              <Input
                id="block-title"
                className="min-h-[44px]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="F.eks. lægebesøg"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <Label htmlFor="block-allday" className="cursor-pointer">
                Hele dagen
              </Label>
              <span className="flex min-h-[44px] min-w-[44px] items-center justify-end">
                <Switch id="block-allday" checked={allDay} onCheckedChange={setAllDay} />
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="block-start-date">Startdato</Label>
                <Input
                  id="block-start-date"
                  type="date"
                  className="min-h-[44px]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              {!allDay && (
                <div>
                  <Label htmlFor="block-start-time">Starttid</Label>
                  <Input
                    id="block-start-time"
                    type="time"
                    step={900}
                    className="min-h-[44px]"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="block-end-date">Slutdato</Label>
                <Input
                  id="block-end-date"
                  type="date"
                  className="min-h-[44px]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              {!allDay && (
                <div>
                  <Label htmlFor="block-end-time">Sluttid</Label>
                  <Input
                    id="block-end-time"
                    type="time"
                    step={900}
                    className="min-h-[44px]"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="block-note">Privat note</Label>
              <Textarea
                id="block-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Kun synlig for dig"
                rows={2}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Noten deles aldrig med kunder.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {editing && !readOnly ? (
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Slet
            </Button>
          ) : (
            <span />
          )}
          {!readOnly && (
            <Button className="min-h-[44px]" onClick={save} disabled={saving}>
              {saving && (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              Gem
            </Button>
          )}
        </DialogFooter>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Slet blokering?</AlertDialogTitle>
              <AlertDialogDescription>
                Tidsrummet bliver igen bookbart for kunder.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[44px]">Fortryd</AlertDialogCancel>
              <AlertDialogAction className="min-h-[44px]" onClick={remove}>
                Slet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

export default BlockTimeDialog;
