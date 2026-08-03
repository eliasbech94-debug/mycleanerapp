import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { formatMoney } from "@/i18n/money";
import { CALENDAR_STATUS } from "../status";
import type { CalendarEvent } from "../useProviderCalendar";
import { fmtDateLong, fmtDeadline, fmtDuration, fmtTime } from "../time";
import { CalendarStatusBadge } from "./CalendarStatusBadge";
import { approxLocation } from "./CalendarEventCard";

/**
 * Booking / block detail body. Rendered inside a desktop side panel or a
 * mobile bottom sheet.
 *
 * Every lifecycle action calls an existing server-authoritative endpoint —
 * `booking-decide` (accept/decline, Stripe capture) or
 * `booking_lifecycle_transition_v1` (state machine). The browser never writes
 * lifecycle columns directly.
 */

type LifecycleTarget =
  | "travelling"
  | "arrived"
  | "work_started"
  | "paused"
  | "resumed"
  | "completed"
  | "cancelled";

const ACTION_LABEL: Record<LifecycleTarget, string> = {
  travelling: "Jeg er på vej",
  arrived: "Marker ankommet",
  work_started: "Start opgaven",
  paused: "Hold pause",
  resumed: "Genoptag",
  completed: "Afslut opgaven",
  cancelled: "Aflys booking",
};

/** Only the transitions the current state allows are offered. */
function allowedActions(status: string): LifecycleTarget[] {
  switch (status) {
    case "accepted":
      return ["travelling", "cancelled"];
    case "travelling":
      return ["arrived"];
    case "arrived":
      return ["work_started"];
    case "work_started":
      return ["paused", "completed"];
    case "paused":
      return ["resumed", "completed"];
    case "resumed":
      return ["paused", "completed"];
    default:
      return [];
  }
}

const IRREVERSIBLE: LifecycleTarget[] = ["completed", "cancelled"];

/** Calm, non-technical copy for every failure path. */
function friendlyError(raw: string | undefined): string {
  const message = (raw || "").toUpperCase();
  if (message.includes("CALENDAR_SLOT_UNAVAILABLE") || message.includes("SLOT")) {
    return "Dette tidspunkt er ikke længere ledigt. Bookingen blev ikke accepteret, og der er ikke trukket betaling.";
  }
  if (message.includes("ALREADY")) return "Bookingen er allerede besvaret.";
  if (message.includes("PAYMENT")) return "Betalingen kunne ikke bekræftes. Prøv igen om lidt.";
  if (message.includes("NOT ALLOWED") || message.includes("FORBIDDEN") || message.includes("403")) {
    return "Du har ikke adgang til denne handling.";
  }
  return "Handlingen kunne ikke gennemføres lige nu. Prøv igen om lidt.";
}

export function EventDetailBody({
  event,
  onChanged,
  onClose,
}: {
  event: CalendarEvent;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LifecycleTarget | null>(null);
  const booking = event.booking;
  const meta = CALENDAR_STATUS[event.status];

  const durationMin = Math.round((event.end.getTime() - event.start.getTime()) / 60000);
  const actions = useMemo(
    () => (booking ? allowedActions(event.status) : []),
    [booking, event.status],
  );

  async function decide(decision: "accepted" | "declined") {
    if (!booking) return;
    setBusy(decision);
    const { data, error } = await supabase.functions.invoke("booking-decide", {
      body: { booking_id: booking.id, decision },
    });
    setBusy(null);
    const failure = error?.message || (data as { error?: string } | null)?.error;
    if (failure) {
      toast.error(friendlyError(failure));
      onChanged();
      return;
    }
    toast.success(decision === "accepted" ? "Booking accepteret" : "Booking afvist");
    onChanged();
    onClose?.();
  }

  async function transition(to: LifecycleTarget) {
    if (!booking) return;
    setBusy(to);
    const { error } = await supabase.rpc("booking_lifecycle_transition_v1", {
      _booking_id: booking.id,
      _to_state: to,
      _idempotency_key: `provider-cal-${booking.id}-${to}`,
    });
    setBusy(null);
    if (error) {
      toast.error(friendlyError(error.message));
      onChanged();
      return;
    }
    toast.success("Status opdateret");
    onChanged();
  }

  if (!booking) {
    return (
      <div className="space-y-4">
        <CalendarStatusBadge status={event.status} />
        <div>
          <p className="font-display text-xl text-foreground">{event.title || meta.label}</p>
          <p className="text-sm text-muted-foreground">{fmtDateLong(event.start)}</p>
          <p className="text-sm text-muted-foreground">
            {event.allDay ? "Hele dagen" : `${fmtTime(event.start)}–${fmtTime(event.end)}`}
          </p>
        </div>
        {!event.editable && (
          <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            Denne begivenhed kommer fra en ekstern kalender og kan ikke redigeres i MyCleaner.
          </p>
        )}
      </div>
    );
  }

  const deadline = booking.assignment_deadline_at
    ? new Date(booking.assignment_deadline_at)
    : null;

  return (
    <div className="space-y-5" data-testid="event-detail">
      <div className="space-y-2">
        <CalendarStatusBadge status={event.status} />
        <p className="font-display text-xl text-foreground">{booking.service}</p>
        <p className="text-sm text-muted-foreground">{fmtDateLong(event.start)}</p>
        <p className="text-sm tabular-nums text-foreground">
          {fmtTime(event.start)}–{fmtTime(event.end)} · {fmtDuration(durationMin)}
        </p>
        {event.status === "pending" && deadline && (
          <p className="text-sm font-medium text-foreground">{fmtDeadline(deadline)}</p>
        )}
      </div>

      <Separator />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field label="Din indtjening" value={formatMoney(booking.provider_gets, booking.currency)} />
        <Field label="Kundens pris" value={formatMoney(booking.customer_pays, booking.currency)} />
        <Field label="Adresse" value={approxLocation(booking.address, event.status)} />
        <Field
          label="Aktiv arbejdstid"
          value={
            booking.active_work_seconds
              ? fmtDuration(Math.round(booking.active_work_seconds / 60))
              : "—"
          }
        />
        <Field
          label="Pause i alt"
          value={
            booking.total_pause_seconds
              ? fmtDuration(Math.round(booking.total_pause_seconds / 60))
              : "—"
          }
        />
        <Field
          label="Frigivelse af beløb"
          value={booking.funds_release_at ? fmtDateLong(new Date(booking.funds_release_at)) : "—"}
        />
      </dl>

      {booking.notes && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground">
          <p className="mb-1 font-medium">Noter fra kunden</p>
          <p className="whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Aflysning følger MyCleaners gældende afbudsregler. Beløb frigives efter kundens
        bekræftelse eller automatisk efter perioden med tilbageholdelse.
      </p>

      <div className="flex flex-wrap gap-2">
        {event.status === "pending" && (
          <>
            <Button
              className="min-h-[44px] flex-1"
              onClick={() => decide("accepted")}
              disabled={busy !== null}
            >
              {busy === "accepted" && (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              Accepter
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px] flex-1"
              onClick={() => decide("declined")}
              disabled={busy !== null}
            >
              Afvis
            </Button>
          </>
        )}

        {actions.map((action) => (
          <Button
            key={action}
            variant={action === "cancelled" ? "outline" : "default"}
            className="min-h-[44px]"
            disabled={busy !== null}
            onClick={() =>
              IRREVERSIBLE.includes(action) ? setConfirm(action) : void transition(action)
            }
          >
            {busy === action && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            {ACTION_LABEL[action]}
          </Button>
        ))}

        {event.status === "completed" && (
          <p className="text-sm text-muted-foreground">
            Afsluttet — afventer kundens bekræftelse.
          </p>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "cancelled" ? "Aflys booking?" : "Afslut opgaven?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "cancelled"
                ? "Aflysningen kan ikke fortrydes og følger de gældende afbudsregler."
                : "Når opgaven afsluttes, sendes den til kundens bekræftelse. Det kan ikke fortrydes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Fortryd</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={() => {
                const target = confirm;
                setConfirm(null);
                if (target) void transition(target);
              }}
            >
              Bekræft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default EventDetailBody;
