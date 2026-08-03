import { describe, expect, it } from "vitest";
import {
  formatNextAvailable,
  resolveProviderStatus,
  STATUS_PRIORITY,
} from "@/lib/providerStatus";

const NOW = new Date("2026-08-03T10:00:00+02:00");

describe("providerStatus", () => {
  it("keeps the documented priority order", () => {
    expect(
      Object.entries(STATUS_PRIORITY).sort((a, b) => a[1] - b[1]).map(([k]) => k),
    ).toEqual(["vacation", "unavailable", "travelling", "busy", "available", "off_hours"]);
  });

  it("resolves vacation with a return date", () => {
    const s = resolveProviderStatus(
      {
        provider_user_id: "u",
        provider_slug: "s",
        status: "vacation",
        active_until: "2026-08-18T08:00:00+02:00",
        next_available_at: "2026-08-18T08:00:00+02:00",
        timezone: "Europe/Copenhagen",
      },
      NOW,
    );
    expect(s?.status).toBe("vacation");
    expect(s?.label).toBe("Holder ferie");
    expect(s?.message).toContain("18. august");
  });

  it("shows no helper message when available now", () => {
    const s = resolveProviderStatus(
      {
        provider_user_id: "u",
        provider_slug: null,
        status: "available",
        active_until: null,
        next_available_at: NOW.toISOString(),
        timezone: "Europe/Copenhagen",
      },
      NOW,
    );
    expect(s?.status).toBe("available");
    expect(s?.message).toBeNull();
  });

  it("falls back to off_hours for unknown server values", () => {
    const s = resolveProviderStatus(
      {
        provider_user_id: "u",
        provider_slug: null,
        status: "something_new",
        active_until: null,
        next_available_at: null,
        timezone: null,
      },
      NOW,
    );
    expect(s?.status).toBe("off_hours");
  });

  it("formats next availability relative to now", () => {
    // Built in local time so the assertions hold in any test timezone.
    const at = (dayOffset: number, h: number, m = 0) => {
      const d = new Date(NOW);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, m, 0, 0);
      return d;
    };
    expect(formatNextAvailable(at(0, 15, 30), NOW)).toBe("Ledig igen i dag kl. 15:30");
    expect(formatNextAvailable(at(1, 8), NOW)).toBe("Ledig i morgen kl. 08:00");
    expect(formatNextAvailable(at(4, 9), NOW)).toMatch(/^Ledig \w+dag kl\. 09:00$/);
    expect(formatNextAvailable(at(17, 9), NOW)).toContain("den ");
  });

  it("returns null without a row", () => {
    expect(resolveProviderStatus(null)).toBeNull();
  });
});
