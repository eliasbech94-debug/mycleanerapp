import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { addDays, fmtDuration, isoDate, sameDay, startOfWeek } from "@/features/calendar/time";
import { CALENDAR_STATUS } from "@/features/calendar/status";
import { ALL_FILTERS, filterKeyFor } from "@/features/calendar/useProviderCalendar";

const detail = readFileSync("src/features/calendar/components/EventDetailBody.tsx", "utf8");
const block = readFileSync("src/features/calendar/components/BlockTimeDialog.tsx", "utf8");
const card = readFileSync("src/features/calendar/components/CalendarEventCard.tsx", "utf8");

describe("calendar time helpers", () => {
  it("starts the week on Monday", () => {
    const sunday = new Date(2026, 0, 4); // Sunday
    expect(isoDate(startOfWeek(sunday))).toBe("2025-12-29");
  });

  it("survives a DST transition when adding days", () => {
    const before = new Date(2026, 2, 28, 10, 0, 0); // day before EU spring-forward
    expect(isoDate(addDays(before, 1))).toBe("2026-03-29");
  });

  it("formats durations in Danish short form", () => {
    expect(fmtDuration(150)).toBe("2 t 30 min");
    expect(fmtDuration(45)).toBe("45 min");
  });

  it("compares calendar days, not timestamps", () => {
    expect(sameDay(new Date(2026, 4, 1, 0, 1), new Date(2026, 4, 1, 23, 59))).toBe(true);
  });
});

describe("calendar status system", () => {
  it("maps every status to a label and token", () => {
    for (const [key, meta] of Object.entries(CALENDAR_STATUS)) {
      expect(meta.label, key).toBeTruthy();
      expect(meta.token, key).toBeTruthy();
    }
  });

  it("routes each status into a known filter bucket", () => {
    const keys = ALL_FILTERS.map((f) => f.key);
    for (const status of Object.keys(CALENDAR_STATUS)) {
      expect(keys).toContain(filterKeyFor(status as keyof typeof CALENDAR_STATUS));
    }
  });
});

describe("calendar contracts", () => {
  it("only mutates lifecycle through server-authoritative endpoints", () => {
    expect(detail).toContain("booking_lifecycle_transition_v1");
    expect(detail).toContain("booking-decide");
    expect(detail).not.toMatch(/from\("bookings"\)\s*\.update/);
  });

  it("confirms irreversible actions before sending them", () => {
    expect(detail).toContain('IRREVERSIBLE: LifecycleTarget[] = ["completed", "cancelled"]');
  });

  it("writes blocks only through the block RPCs", () => {
    expect(block).toContain("provider_upsert_calendar_block_v1");
    expect(block).toContain("provider_delete_calendar_block_v1");
    expect(block).not.toMatch(/from\("provider_calendar_blocks"\)\s*\.(insert|update|delete)/);
  });

  it("hides the exact customer address until the provider is on the way", () => {
    expect(card).toContain("approxLocation");
  });
});
