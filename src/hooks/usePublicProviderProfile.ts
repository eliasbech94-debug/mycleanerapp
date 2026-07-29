import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type {
  AvailabilityStatus,
  PresenceStatus,
  PublicProviderProfile,
  PublicReview,
  PublicWorkHistoryEntry,
  Slot,
} from "@/components/provider/public/types";

// The generated Supabase types lag behind newly added RPCs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

/** Great-circle distance in km between two coordinates. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Calendar availability. This is NEVER presence — a provider with free slots is
 * "Tilgængelig", not "Online".
 */
export function deriveAvailabilityStatus(slots: Slot[] | null): AvailabilityStatus {
  return slots && slots.length > 0 ? "available" : "unavailable";
}

/** Presence window: active on the platform within the last 10 minutes. */
export const PRESENCE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Real presence only. Returns "unknown" when no presence source exists, which
 * makes the UI hide "Online nu" entirely until presence tracking ships.
 */
export function derivePresenceStatus(lastSeenAt: string | null | undefined, now = Date.now()): PresenceStatus {
  if (!lastSeenAt) return "unknown";
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return "unknown";
  return now - t <= PRESENCE_WINDOW_MS ? "online" : "unknown";
}

type State = {
  profile: PublicProviderProfile | null | undefined;
  workHistory: PublicWorkHistoryEntry[];
  slots: Slot[] | null;
  nextSlot: Slot | null;
};

const EMPTY: State = { profile: undefined, workHistory: [], slots: null, nextSlot: null };

/**
 * Single data source for the public provider profile page.
 * Slug resolution stays in the page (it owns navigation).
 */
export function usePublicProviderProfileData(slug: string | undefined, enabled = true) {
  const { user } = useAuth();
  const [state, setState] = useState<State>(EMPTY);
  const [isFav, setIsFav] = useState(false);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  const reviewsRequested = useRef(false);

  // --- profile (v2, falls back to v1 while the function rolls out) ---
  useEffect(() => {
    if (!slug || !enabled) return;
    let alive = true;
    (async () => {
      const { data, error } = await rpc("get_public_provider_profile_v2", { _slug: slug });
      let row = ((data as PublicProviderProfile[] | null) ?? [])[0] ?? null;
      if (error) {
        const legacy = await rpc("get_public_provider_profile_v1", { _slug: slug });
        row = ((legacy.data as PublicProviderProfile[] | null) ?? [])[0] ?? null;
      }
      if (!alive) return;
      setState((s) => ({ ...s, profile: row }));
    })();
    return () => {
      alive = false;
    };
  }, [slug, enabled]);

  // --- verified work history ---
  useEffect(() => {
    if (!slug || !enabled) return;
    let alive = true;
    (async () => {
      const { data } = await rpc("list_public_provider_work_history_v1", { _slug: slug });
      if (!alive) return;
      setState((s) => ({ ...s, workHistory: (data as PublicWorkHistoryEntry[] | null) ?? [] }));
    })();
    return () => {
      alive = false;
    };
  }, [slug, enabled]);

  // --- bookable availability (respects bookings, blocks, vacation, iCal) ---
  useEffect(() => {
    if (!slug || !enabled) return;
    let alive = true;
    (async () => {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const today = new Date();
      const { data, error } = await rpc("list_provider_bookable_slots_v1", {
        _slug: slug,
        _from: iso(today),
        _to: iso(new Date(today.getTime() + 14 * 86400000)),
      });
      if (!alive) return;
      if (error) {
        setState((s) => ({ ...s, slots: [] }));
        return;
      }
      const rows = ((data as Slot[] | null) ?? []).slice(0, 120);
      if (rows.length > 0) {
        setState((s) => ({ ...s, slots: rows, nextSlot: null }));
        return;
      }
      const far = await rpc("list_provider_bookable_slots_v1", {
        _slug: slug,
        _from: iso(today),
        _to: iso(new Date(today.getTime() + 60 * 86400000)),
      });
      if (!alive) return;
      setState((s) => ({
        ...s,
        slots: rows,
        nextSlot: ((far.data as Slot[] | null) ?? [])[0] ?? null,
      }));
    })();
    return () => {
      alive = false;
    };
  }, [slug, enabled]);

  // --- follow / favourite state ---
  useEffect(() => {
    if (!user || !slug || !enabled) return;
    let alive = true;
    (async () => {
      const { data } = await rpc("list_favorite_providers_v1");
      if (!alive) return;
      const set = new Set(((data as { provider_slug: string }[] | null) ?? []).map((r) => r.provider_slug));
      setIsFav(set.has(slug));
    })();
    return () => {
      alive = false;
    };
  }, [user, slug, enabled]);

  /** Optimistic follow toggle; reverts on failure. */
  const toggleFollow = useCallback(async () => {
    if (!slug) return { ok: false, reason: "no-slug" as const };
    if (!user) return { ok: false, reason: "signed-out" as const };
    setIsFav((v) => !v);
    const { error } = await rpc("toggle_favorite_by_slug_v1", { _slug: slug });
    if (error) {
      setIsFav((v) => !v);
      return { ok: false, reason: "error" as const, message: error.message };
    }
    return { ok: true as const };
  }, [slug, user]);

  /** Ask for the customer's location; silently ignore denial. */
  const requestCustomerLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCustomerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCustomerCoords(null),
      { maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }, []);

  /** Lazy-loaded reviews (no review source yet → empty, section hides). */
  const loadReviews = useCallback(async () => {
    if (reviewsRequested.current) return;
    reviewsRequested.current = true;
    const { data, error } = await rpc("list_public_provider_reviews_v1", { _slug: slug, _limit: 5 });
    setReviews(error ? [] : ((data as PublicReview[] | null) ?? []));
  }, [slug]);

  const distanceKm = useMemo(() => {
    const p = state.profile;
    if (!p || !customerCoords || p.approx_lat == null || p.approx_lng == null) return null;
    return haversineKm(customerCoords, { lat: Number(p.approx_lat), lng: Number(p.approx_lng) });
  }, [state.profile, customerCoords]);

  const availabilityStatus = useMemo(() => deriveAvailabilityStatus(state.slots), [state.slots]);

  // No presence source exists yet (no last_seen_at column / realtime presence).
  // Until it does this stays "unknown" and the hero hides "Online nu".
  const presenceStatus = useMemo<PresenceStatus>(
    () => derivePresenceStatus((state.profile as { last_seen_at?: string | null } | null)?.last_seen_at ?? null),
    [state.profile],
  );

  return {
    ...state,
    isFav,
    toggleFollow,
    distanceKm,
    availabilityStatus,
    presenceStatus,
    reviews,
    loadReviews,
    requestCustomerLocation,
    setProfile: (p: PublicProviderProfile | null) => setState((s) => ({ ...s, profile: p })),
  };
}
