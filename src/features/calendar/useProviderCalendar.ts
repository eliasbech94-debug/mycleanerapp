/**
 * Provider calendar data layer.
 *
 * Reads only existing, authoritative sources:
 *  - `bookings`                    (lifecycle_state is the status source of truth)
 *  - `provider_calendar_blocks`    (manual blocks, vacation, sickness, external)
 *  - `provider_availability_rules` (weekly working hours + timezone)
 *
 * The browser never derives availability; it only renders what the server owns.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { addDays, isoDate } from "./time";
import { bookingStatusKey, type CalendarStatusKey } from "./status";

export type CalendarBookingRow = {
  id: string;
  booking_date: string;
  slot: string;
  hours: number;
  service: string;
  status: string;
  lifecycle_state: string | null;
  address: string;
  notes: string | null;
  customer_pays: number;
  provider_gets: number;
  currency: string;
  timezone: string | null;
  created_at: string;
  work_started_at: string | null;
  work_completed_at: string | null;
  active_work_seconds: number | null;
  total_pause_seconds: number | null;
  funds_release_at: string | null;
  payment_status: string | null;
  payout_status: string | null;
  assignment_deadline_at: string | null;
};

export type CalendarBlockRow = {
  id: string;
  block_type: "day_off" | "time_block" | "vacation" | "sick_leave" | "external";
  title: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  source: string;
};

export type WorkingWindow = { weekday: number; start: string; end: string };

export type CalendarEvent = {
  id: string;
  kind: "booking" | "block";
  status: CalendarStatusKey;
  start: Date;
  end: Date;
  title: string;
  allDay: boolean;
  /** Manual blocks the provider owns may be edited/removed; external ones may not. */
  editable: boolean;
  booking?: CalendarBookingRow;
  block?: CalendarBlockRow;
};

export type CalendarFilterKey =
  | "requests"
  | "accepted"
  | "active"
  | "completed"
  | "blocks"
  | "vacation"
  | "sick"
  | "external";

const ACTIVE_STATES: CalendarStatusKey[] = [
  "travelling",
  "arrived",
  "work_started",
  "paused",
  "resumed",
];
const COMPLETED_STATES: CalendarStatusKey[] = [
  "completed",
  "awaiting_customer_confirmation",
  "customer_confirmed",
  "hold_active",
  "funds_released",
  "payout_scheduled",
  "paid",
  "cancelled",
  "declined",
];

export function filterKeyFor(status: CalendarStatusKey): CalendarFilterKey {
  if (status === "pending") return "requests";
  if (status === "accepted") return "accepted";
  if (ACTIVE_STATES.includes(status)) return "active";
  if (COMPLETED_STATES.includes(status)) return "completed";
  if (status === "vacation") return "vacation";
  if (status === "sick_leave") return "sick";
  if (status === "external") return "external";
  return "blocks";
}

export const ALL_FILTERS: { key: CalendarFilterKey; label: string }[] = [
  { key: "requests", label: "Anmodninger" },
  { key: "accepted", label: "Accepterede" },
  { key: "active", label: "Aktive" },
  { key: "completed", label: "Afsluttede" },
  { key: "blocks", label: "Blokeringer" },
  { key: "vacation", label: "Ferie" },
  { key: "sick", label: "Sygdom" },
  { key: "external", label: "Eksterne" },
];

function bookingToEvent(row: CalendarBookingRow): CalendarEvent {
  const start = new Date(`${row.booking_date}T${(row.slot || "00:00").slice(0, 5)}:00`);
  const end = new Date(start.getTime() + Math.max(0.5, Number(row.hours) || 1) * 3600_000);
  return {
    id: `booking:${row.id}`,
    kind: "booking",
    status: bookingStatusKey(row),
    start,
    end,
    title: row.service,
    allDay: false,
    editable: false,
    booking: row,
  };
}

function blockToEvent(row: CalendarBlockRow): CalendarEvent {
  return {
    id: `block:${row.id}`,
    kind: "block",
    status: row.block_type as CalendarStatusKey,
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    title: row.title || "",
    allDay: row.all_day,
    editable: row.block_type !== "external" && row.source !== "external",
    block: row,
  };
}

export type ProviderCalendarData = {
  events: CalendarEvent[];
  workingWindows: WorkingWindow[];
  timezone: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProviderCalendar(from: Date, to: Date): ProviderCalendarData {
  const { user, profile } = useAuth();
  const providerId = profile?.provider_id ?? null;
  const fromKey = isoDate(from);
  const toKey = isoDate(addDays(to, 1));

  const [bookings, setBookings] = useState<CalendarBookingRow[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlockRow[]>([]);
  const [windows, setWindows] = useState<WorkingWindow[]>([]);
  const [timezone, setTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Copenhagen",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const bookingQuery = providerId
      ? supabase
          .from("bookings")
          .select(
            "id,booking_date,slot,hours,service,status,lifecycle_state,address,notes,customer_pays,provider_gets,currency,timezone,created_at,work_started_at,work_completed_at,active_work_seconds,total_pause_seconds,funds_release_at,payment_status,payout_status,assignment_deadline_at",
          )
          .eq("provider_id", providerId)
          .gte("booking_date", fromKey)
          .lt("booking_date", toKey)
          .order("booking_date")
      : Promise.resolve({ data: [], error: null } as never);

    const [bookingRes, blockRes, ruleRes] = await Promise.all([
      bookingQuery,
      supabase
        .from("provider_calendar_blocks")
        .select("id,block_type,title,starts_at,ends_at,all_day,source")
        .eq("provider_user_id", user.id)
        .lt("starts_at", `${toKey}T00:00:00.000Z`)
        .gte("ends_at", `${fromKey}T00:00:00.000Z`)
        .order("starts_at"),
      supabase
        .from("provider_availability_rules")
        .select("weekday,local_start_time,local_end_time,timezone")
        .eq("provider_user_id", user.id)
        .eq("is_active", true)
        .order("weekday"),
    ]);

    if (bookingRes.error || blockRes.error || ruleRes.error) {
      setError("Kalenderen kunne ikke hentes lige nu.");
      setLoading(false);
      return;
    }

    setBookings((bookingRes.data ?? []) as CalendarBookingRow[]);
    setBlocks((blockRes.data ?? []) as CalendarBlockRow[]);
    const rules = ruleRes.data ?? [];
    if (rules.length) setTimezone(String(rules[0].timezone || timezone));
    setWindows(
      rules.map((r) => ({
        weekday: Number(r.weekday) % 7,
        start: String(r.local_start_time).slice(0, 5),
        end: String(r.local_end_time).slice(0, 5),
      })),
    );
    setLoading(false);
    // `timezone` is only read as a fallback default; excluding it keeps the
    // loader stable instead of refetching after the first resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, providerId, fromKey, toKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const events = useMemo(
    () =>
      [...bookings.map(bookingToEvent), ...blocks.map(blockToEvent)].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      ),
    [bookings, blocks],
  );

  return { events, workingWindows: windows, timezone, loading, error, refresh: load };
}

/** Working windows for a given date (weekday 0=Sunday to match Date#getDay). */
export function windowsForDate(windows: WorkingWindow[], date: Date): WorkingWindow[] {
  const weekday = date.getDay();
  return windows.filter((w) => (w.weekday === 0 ? 0 : w.weekday) === weekday);
}
