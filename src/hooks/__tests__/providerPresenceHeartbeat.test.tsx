import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const rpcMock = vi.fn().mockResolvedValue({ data: { throttled: false }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  useProviderPresenceHeartbeat,
  pingProviderPresence,
} from "@/hooks/useProviderPresenceHeartbeat";
import { resolveRange } from "@/hooks/useLiveStatusAnalytics";

describe("provider presence heartbeat", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("does nothing for non-providers", () => {
    renderHook(() => useProviderPresenceHeartbeat(false));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("beats once on app open", () => {
    renderHook(() => useProviderPresenceHeartbeat(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("provider_presence_heartbeat_v1", { _source: "app_open" });
  });

  it("throttles rapid pings to at most one write per 2 minutes", () => {
    renderHook(() => useProviderPresenceHeartbeat(true));
    rpcMock.mockClear();
    act(() => {
      pingProviderPresence();
      pingProviderPresence();
      pingProviderPresence();
    });
    expect(rpcMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000 + 1000);
      pingProviderPresence();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("beats on the configured interval while the app is used", () => {
    renderHook(() => useProviderPresenceHeartbeat(true));
    rpcMock.mockClear();
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000 + 100);
    });
    expect(rpcMock).toHaveBeenCalledWith("provider_presence_heartbeat_v1", { _source: "interval" });
  });
});

describe("admin analytics range filters", () => {
  it("resolves today, 7 and 30 day windows", () => {
    const today = resolveRange({ range: "today" });
    expect(new Date(today.from).getHours()).toBe(0);

    const week = resolveRange({ range: "7d" });
    const days = (Date.parse(week.to) - Date.parse(week.from)) / 86400000;
    expect(Math.round(days)).toBe(7);

    const month = resolveRange({ range: "30d" });
    expect(Math.round((Date.parse(month.to) - Date.parse(month.from)) / 86400000)).toBe(30);
  });

  it("honours a custom range", () => {
    const custom = resolveRange({ range: "custom", from: "2026-01-01", to: "2026-01-31" });
    expect(custom.from.startsWith("2026-01-01")).toBe(true);
    expect(Date.parse(custom.to)).toBeGreaterThan(Date.parse(custom.from));
  });
});
