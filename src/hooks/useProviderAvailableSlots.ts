import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a marketplace provider id (text, e.g. "p_002") to the underlying
 * auth user id. Demo/seed providers have no backing row — callers fall back to
 * a static slot grid in that case.
 */
export function useProviderUserId(providerIdText?: string | null) {
  const [userId, setUserId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!providerIdText) {
      setUserId(null);
      setResolved(true);
      return;
    }
    setResolved(false);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("provider_id", providerIdText)
        .maybeSingle();
      if (cancelled) return;
      setUserId((data?.id as string) ?? null);
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerIdText]);

  return { providerUserId: userId, resolved };
}

export type AvailableSlot = {
  local_date: string;
  local_time: string;
  slot_start: string;
  timezone: string;
};

/**
 * Authoritative availability: the database derives open slots from weekly
 * working hours minus blocks, bookings and live checkout locks. The client
 * never computes availability itself.
 */
export function useProviderAvailableSlots(
  providerUserId: string | null,
  isoDate: string | null,
  durationMinutes: number,
) {
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!providerUserId || !isoDate) {
      setSlots(null);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "get_provider_available_slots_v1",
        {
          _provider_user_id: providerUserId,
          _from: isoDate,
          _to: isoDate,
          _duration_minutes: Math.round(durationMinutes),
          _step_minutes: 30,
        },
      );
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setSlots([]);
      } else {
        setSlots((data ?? []) as AvailableSlot[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerUserId, isoDate, durationMinutes]);

  return { slots, loading, error };
}
