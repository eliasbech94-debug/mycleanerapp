import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeQuery, aggregateError } from "@/hooks/lib/safeQuery";

/**
 * Provider dashboard aggregator hook.
 *
 * All queries hit real tables (`provider_profiles`, `bookings`,
 * `provider_offers`, `finance_payouts`, `booking_cancellations`).
 * Per-slice errors are captured so a single failure doesn't wipe the
 * dashboard. Metrics without a real source are exposed as `null` for
 * honest empty states.
 */

export type ProviderBooking = {
  id: string;
  provider_id: string | null;
  service: string | null;
  hours: number | null;
  booking_date: string;
  slot: string | null;
  address: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  dispatch_status: string | null;
  customer_pays: number | null;
  provider_gets: number | null;
  currency: string | null;
  payout_status: string | null;
  created_at: string;
};

export type ProviderPayout = {
  id: string;
  status: string;
  net_amount: number | null;
  currency: string | null;
  arrival_date: string | null;
  created_at: string;
};

export interface ProviderProfileRow {
  display_name: string | null;
  completion_pct: number | null;
  provider_score: number | null;
  provider_tier: string | null;
  status: string | null;
  identity_status: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_details_submitted: boolean | null;
  payout_frozen: boolean | null;
  visibility: string | null;
  is_public: boolean | null;
}

export interface ProviderDashboardData {
  firstName: string | null;
  profile: ProviderProfileRow | null;
  todaysSchedule: ProviderBooking[];
  openRequests: ProviderBooking[];
  upcoming: ProviderBooking[];
  recent: ProviderBooking[];
  payouts: ProviderPayout[];
  stats: {
    completed: number;
    acceptanceRate: number | null;
    cancellationRate: number | null;
    avgResponseSeconds: number | null;
    earningsMinor: number;
    currency: string | null;
    ratingAvg: number | null;
    ratingCount: number | null;
  };
}

export type ProviderDashboardResult = ProviderDashboardData & {
  data: ProviderDashboardData;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  sliceErrors: {
    profile: string | null;
    bookings: string | null;
    offers: string | null;
    payouts: string | null;
    cancellations: string | null;
  };
  refetch: () => Promise<void>;
};

const EMPTY: ProviderDashboardData = {
  firstName: null,
  profile: null,
  todaysSchedule: [],
  openRequests: [],
  upcoming: [],
  recent: [],
  payouts: [],
  stats: {
    completed: 0,
    acceptanceRate: null,
    cancellationRate: null,
    avgResponseSeconds: null,
    earningsMinor: 0,
    currency: null,
    ratingAvg: null,
    ratingCount: null,
  },
};

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function useProviderDashboard(): ProviderDashboardResult {
  const { user, profile: authProfile } = useAuth();
  const [data, setData] = useState<ProviderDashboardData>(EMPTY);
  const [isLoading, setLoading] = useState(true);
  const [sliceErrors, setSliceErrors] = useState({
    profile: null as string | null,
    bookings: null as string | null,
    offers: null as string | null,
    payouts: null as string | null,
    cancellations: null as string | null,
  });

  const providerIdText = authProfile?.provider_id ?? null;

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [ppRes, bookingsRes, offersRes, payoutsRes] = await Promise.all([
      safeQuery(
        "provider.profile",
        supabase
          .from("provider_profiles")
          .select(
            "display_name,completion_pct,provider_score,provider_tier,status,identity_status,stripe_charges_enabled,stripe_payouts_enabled,stripe_details_submitted,payout_frozen,visibility,is_public",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      ),
      providerIdText
        ? safeQuery(
            "provider.bookings",
            supabase
              .from("bookings")
              .select(
                "id,provider_id,service,hours,booking_date,slot,address,status,dispatch_status,customer_pays,provider_gets,currency,payout_status,created_at",
              )
              .eq("provider_id", providerIdText)
              .order("booking_date", { ascending: false })
              .limit(200),
          )
        : Promise.resolve({ data: [] as ProviderBooking[], error: null }),
      safeQuery(
        "provider.offers",
        supabase
          .from("provider_offers")
          .select("offer_status,offered_at,viewed_at,accepted_at,declined_at,expired_at")
          .eq("provider_user_id", user.id)
          .order("offered_at", { ascending: false })
          .limit(200),
      ),
      safeQuery(
        "provider.payouts",
        supabase
          .from("finance_payouts")
          .select("id,status,net_amount,currency,arrival_date,created_at")
          .eq("provider_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ),
    ]);

    const pp = (ppRes.data ?? null) as ProviderProfileRow | null;
    const bookings = (bookingsRes.data ?? []) as ProviderBooking[];
    const offers = (offersRes.data ?? []) as Array<{
      offer_status: string;
      offered_at: string | null;
      accepted_at: string | null;
      declined_at: string | null;
      expired_at: string | null;
    }>;
    const payouts = (payoutsRes.data ?? []) as ProviderPayout[];

    let cancelledByProvider = 0;
    let cancellationsError: string | null = null;
    if (bookings.length) {
      const ids = bookings.map((b) => b.id);
      const cancelRes = await safeQuery(
        "provider.cancellations",
        supabase
          .from("booking_cancellations")
          .select("actor_role,booking_id")
          .in("booking_id", ids),
      );
      cancellationsError = cancelRes.error;
      cancelledByProvider = ((cancelRes.data ?? []) as Array<{ actor_role: string }>).filter(
        (c) => c.actor_role === "provider",
      ).length;
    }

    const today = todayISO();
    const now = new Date();

    const todaysSchedule = bookings.filter(
      (b) => b.booking_date === today && (b.status === "accepted" || b.status === "pending"),
    );
    const openRequests = bookings.filter(
      (b) =>
        b.status === "pending" ||
        b.dispatch_status === "awaiting_provider" ||
        b.dispatch_status === "dispatched",
    );
    const upcoming = bookings
      .filter(
        (b) =>
          new Date(b.booking_date) >= new Date(today) &&
          b.status === "accepted",
      )
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    const recent = bookings
      .filter((b) => b.status === "completed" || new Date(b.booking_date) < now)
      .slice(0, 6);

    const completed = bookings.filter((b) => b.status === "completed");
    const earningsMinor = completed.reduce(
      (s, b) => s + (typeof b.provider_gets === "number" ? b.provider_gets : 0),
      0,
    );
    const currency = completed.find((b) => b.currency)?.currency ?? null;

    const decidedOffers = offers.filter(
      (o) =>
        o.offer_status === "accepted" ||
        o.offer_status === "declined" ||
        o.offer_status === "expired",
    );
    const acceptedCount = offers.filter((o) => o.offer_status === "accepted").length;
    const acceptanceRate = decidedOffers.length
      ? Math.round((acceptedCount / decidedOffers.length) * 100)
      : null;

    const responded = offers
      .map((o) => {
        if (!o.offered_at) return null;
        const decidedAt = o.accepted_at || o.declined_at;
        if (!decidedAt) return null;
        const diff =
          (new Date(decidedAt).getTime() - new Date(o.offered_at).getTime()) / 1000;
        return diff > 0 ? diff : null;
      })
      .filter((n): n is number => typeof n === "number");
    const avgResponseSeconds = responded.length
      ? Math.round(responded.reduce((s, n) => s + n, 0) / responded.length)
      : null;

    const cancellationRate = bookings.length
      ? Math.round((cancelledByProvider / bookings.length) * 100)
      : null;

    const firstName = pp?.display_name?.split(" ")[0] ?? null;

    setData({
      firstName,
      profile: pp,
      todaysSchedule,
      openRequests,
      upcoming,
      recent,
      payouts,
      stats: {
        completed: completed.length,
        acceptanceRate,
        cancellationRate,
        avgResponseSeconds,
        earningsMinor,
        currency,
        ratingAvg: null,
        ratingCount: null,
      },
    });
    setSliceErrors({
      profile: ppRes.error,
      bookings: (bookingsRes as any).error ?? null,
      offers: offersRes.error,
      payouts: payoutsRes.error,
      cancellations: cancellationsError,
    });
    setLoading(false);
  }, [user, providerIdText]);

  useEffect(() => {
    void load();
    if (!user) return;

    const ch = supabase
      .channel(`provider-dash-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          // Server-side filter: without it every provider subscribes to all
          // booking changes platform-wide and reloads on unrelated activity.
          filter: `provider_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "provider_offers",
          filter: `provider_user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "provider_profiles",
          filter: `user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, user]);

  const error = aggregateError([
    sliceErrors.profile,
    sliceErrors.bookings,
    sliceErrors.offers,
    sliceErrors.payouts,
    sliceErrors.cancellations,
  ]);

  return {
    ...data,
    data,
    loading: isLoading,
    isLoading,
    error,
    sliceErrors,
    refetch: load,
  };
}
