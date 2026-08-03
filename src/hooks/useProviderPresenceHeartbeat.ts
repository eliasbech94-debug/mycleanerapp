/**
 * Throttled provider presence heartbeat.
 *
 * Writes are server-authoritative (`provider_presence_heartbeat_v1`) and are
 * additionally throttled in the database (max one write per 60s). The client
 * only pings on meaningful moments — app open, returning to the foreground,
 * an important provider action, and at most once per interval while used.
 *
 * There are NO mousemove/scroll listeners: presence must not create write load.
 */
import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_HEARTBEAT_MIN_GAP_MS,
} from "@/lib/providerPresence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

/** Fire from anywhere after an important provider action. */
export const PROVIDER_PRESENCE_PING_EVENT = "mycleaner:provider-presence-ping";

export function pingProviderPresence() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROVIDER_PRESENCE_PING_EVENT));
  }
}

export function useProviderPresenceHeartbeat(enabled: boolean) {
  const lastSentRef = useRef(0);

  const beat = useCallback(
    async (source: string) => {
      if (!enabled) return;
      const now = Date.now();
      if (now - lastSentRef.current < PRESENCE_HEARTBEAT_MIN_GAP_MS) return;
      lastSentRef.current = now;
      try {
        await rpc("provider_presence_heartbeat_v1", { _source: source });
      } catch {
        // Presence is best-effort; never surface heartbeat failures to the UI.
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    void beat("app_open");

    const interval = setInterval(() => void beat("interval"), PRESENCE_HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat("foreground");
    };
    const onAction = () => void beat("action");

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(PROVIDER_PRESENCE_PING_EVENT, onAction);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(PROVIDER_PRESENCE_PING_EVENT, onAction);
    };
  }, [enabled, beat]);

  return { beat };
}

export default useProviderPresenceHeartbeat;
