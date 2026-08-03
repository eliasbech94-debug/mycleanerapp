import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABEL_DA, PRIORITY_ORDER } from "@/lib/support/labels";

interface Props {
  conversation: { id: string; status: string; priority: string | null; booking_id?: string | null };
  onDone: () => void;
}

/**
 * Escalation dialog. Server-side (`conversation-escalate`) is the
 * source of truth — this only collects input. Requires a 3+ char reason.
 */
export function EscalateDialog({ conversation, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<string>(conversation.priority ?? "high");
  const [note, setNote] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("conversation-escalate", {
        body: {
          conversation_id: conversation.id,
          reason: reason.trim(),
          priority,
          internal_note: note.trim() || undefined,
          booking_ref: bookingRef.trim() || undefined,
        },
      });
      if (error) throw error;
      const result = data as { error?: string } | null;
      if (result?.error) throw new Error(result.error);
      toast.success("Sagen er sendt videre. Administratorerne er notificeret.");
      setOpen(false);
      setReason(""); setNote(""); setBookingRef("");
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "already_escalated") toast.error("Sagen er allerede sendt videre til en administrator.");
      else toast.error("Sagen blev ikke sendt videre. Prøv igen om lidt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10">
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          Eskalér
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eskalér sag til administrator</DialogTitle>
          <DialogDescription>
            Alle administratorer notificeres straks. Beskriv sagen neutralt og faktuelt — teksten gemmes uændret i sagens tidslinje og indgår i vurderingen af begge parters oplysninger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="esc-reason">Årsag <span className="text-destructive">*</span></Label>
            <Textarea
              id="esc-reason" autoFocus rows={3} maxLength={1000}
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Fx: Kunden har anmodet om refundering, og provideren har endnu ikke svaret."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="esc-priority">Prioritet</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="esc-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL_DA[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="esc-booking">Booking-reference (valgfri)</Label>
            <Input
              id="esc-booking" maxLength={64}
              value={bookingRef} onChange={(e) => setBookingRef(e.target.value)}
              placeholder={conversation.booking_id ?? "Fx BKG-123456"}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="esc-note">Intern note til admin (valgfri)</Label>
            <Textarea
              id="esc-note" rows={2} maxLength={4000}
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Kun synlig for support og admin — kunden og provideren ser den ikke."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Luk vindue
          </Button>
          <Button
            onClick={submit}
            disabled={busy || reason.trim().length < 3}
            variant="destructive"
          >
            {busy ? "Sender…" : "Send sagen videre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
