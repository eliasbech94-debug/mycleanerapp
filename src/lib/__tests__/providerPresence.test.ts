import { describe, expect, it } from "vitest";
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_ONLINE_MINUTES,
  PRESENCE_RECENT_MINUTES,
  PRESENCE_VISIBLE_MINUTES,
  presenceStateFromMinutes,
  resolvePresence,
} from "@/lib/providerPresence";
import { resolveProviderStatus, STATUS_PRIORITY } from "@/lib/providerStatus";

const row = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    provider_user_id: "u1",
    provider_slug: "anna",
    status: "available",
    active_until: null,
    next_available_at: null,
    timezone: "Europe/Copenhagen",
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe("presence thresholds", () => {
  it("uses one shared set of constants", () => {
    expect(PRESENCE_ONLINE_MINUTES).toBe(3);
    expect(PRESENCE_RECENT_MINUTES).toBe(15);
    expect(PRESENCE_VISIBLE_MINUTES).toBe(60);
    expect(PRESENCE_HEARTBEAT_INTERVAL_MS).toBe(180000);
  });

  it.each([
    [0, "online"],
    [3, "online"],
    [4, "recent"],
    [15, "recent"],
    [16, "idle"],
    [60, "idle"],
    [61, "offline"],
  ])("minute %i maps to %s", (minutes, expected) => {
    expect(presenceStateFromMinutes(minutes)).toBe(expected);
  });

  it("hides activity text older than 60 minutes", () => {
    expect(resolvePresence("offline", 61).text).toBeNull();
    expect(resolvePresence("offline", null).text).toBeNull();
  });

  it("expires online when the heartbeat is stale", () => {
    expect(resolvePresence("online", 2).online).toBe(true);
    expect(resolvePresence("online", 9).online).toBe(false);
    expect(resolvePresence("online", 9).text).toBe("Aktiv for få minutter siden");
  });

  it("renders exact minutes between 16 and 60", () => {
    expect(resolvePresence("idle", 42).text).toBe("Aktiv for 42 min. siden");
  });

  it("supports Danish and English wording", () => {
    expect(resolvePresence("online", 1, "da").text).toBe("Online nu");
    expect(resolvePresence("online", 1, "en").text).toBe("Online now");
    expect(resolvePresence("idle", 20, "en").text).toBe("Active 20 min ago");
  });
});

describe("presence never overrides live status", () => {
  it("keeps busy while the app is closed", () => {
    const s = resolveProviderStatus(row({ status: "busy", presence_state: "offline", presence_minutes: null }));
    expect(s?.status).toBe("busy");
    expect(s?.presence.text).toBeNull();
  });

  it("keeps available without claiming the provider is online", () => {
    const s = resolveProviderStatus(row({ status: "available", presence_state: "offline", presence_minutes: 400 }));
    expect(s?.status).toBe("available");
    expect(s?.presence.online).toBe(false);
  });

  it("stale heartbeat does not change the booking-derived status", () => {
    const fresh = resolveProviderStatus(row({ status: "travelling", presence_minutes: 1 }));
    const stale = resolveProviderStatus(row({ status: "travelling", presence_minutes: 900 }));
    expect(fresh?.status).toBe(stale?.status);
    expect(fresh?.presence.online).toBe(true);
    expect(stale?.presence.online).toBe(false);
  });

  it("ranks lifecycle statuses above availability", () => {
    expect(STATUS_PRIORITY.travelling).toBeLessThan(STATUS_PRIORITY.busy);
    expect(STATUS_PRIORITY.busy).toBeLessThan(STATUS_PRIORITY.available);
    expect(STATUS_PRIORITY.vacation).toBe(1);
  });
});

describe("travelling status", () => {
  it("exposes the short label and supporting text", () => {
    const s = resolveProviderStatus(row({ status: "travelling" }));
    expect(s?.label).toBe("På vej");
    expect(s?.message).toBe("På vej til kunde");
  });
});
