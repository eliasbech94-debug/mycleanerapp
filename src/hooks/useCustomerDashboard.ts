import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeQuery, aggregateError } from "@/hooks/lib/safeQuery";

/**
 * Customer dashboard aggregator hook.
 *
 * All queries hit real tables (`profiles`, `bookings`). Errors from any
 * slice are captured per-section so a single failed query never removes
 * data returned by the others. No mock data, no fabricated numbers.
 */

export type CustomerBooking = {
  id: string;
  provider_name: string | null;
  service: string | null;
  hours: number | null;
  booking_date: string;
  slot: string | null;
  address: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  customer_pays: number | null;
  currency: string | null;
};

export interface CustomerDashboardData {
  firstName: string | null;
  profileCompletion: number | null;
  upcoming: CustomerBooking[];
  history: CustomerBooking[];
  stats: {
    completed: number;
    upcoming: number;
    totalSpentMinor: number;
    currency: string | null;
  };
}

export type CustomerDashboardResult = CustomerDashboardData & {
  /** Aggregated data slice (also spread flat above for legacy consumers). */
  data: CustomerDashboardData;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  sliceErrors: { profile: string | null; bookings: string | null };
  refetch: () => Promise<void>;
};

const EMPTY_DATA: CustomerDashboardData = {
  firstName: null,
  profileCompletion: null,
  upcoming: [],
  history: [],
  stats: { completed: 0, upcoming: 0, totalSpentMinor: 0, currency: null },
};

export function useCustomerDashboard(): CustomerDashboardResult {
  const { user } = useAuth();
  const [data, setData] = useState<CustomerDashboardData>(EMPTY_DATA);
  const [isLoading, setLoading] = useState(true);
  const [sliceErrors, setSliceErrors] = useState<{
    profile: string | null;
    bookings: string | null;
  }>({ profile: null, bookings: null });

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [profileRes, bookingsRes] = await Promise.all([
      safeQuery(
        "customer.profile",
        supabase
          .from("profiles")
          .select("full_name,phone,address,country_code")
          .eq("id", user.id)
          .maybeSingle(),
      ),
      safeQuery(
        "customer.bookings",
        supabase
          .from("bookings")
          .select(
            "id,provider_name,service,hours,booking_date,slot,address,status,customer_pays,currency",
          )
          .eq("customer_user_id", user.id)
          .order("booking_date", { ascending: false })
          .limit(50),
      ),
    ]);

    const profile = profileRes.data as {
      full_name: string | null;
      phone: string | null;
      address: string | null;
      country_code: string | null;
    } | null;

    const fields = profile
      ? [profile.full_name, profile.phone, profile.address, profile.country_code]
      : [];
    const filled = fields.filter(Boolean).length;
    const completion = fields.length ? Math.round((filled / fields.length) * 100) : null;
    const firstName = profile?.full_name?.split(" ")[0] ?? null;

    const bookings = (bookingsRes.data ?? []) as CustomerBooking[];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = bookings
      .filter(
        (b) =>
          new Date(b.booking_date) >= today &&
          b.status !== "cancelled" &&
          b.status !== "declined",
      )
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    const history = bookings.filter(
      (b) => new Date(b.booking_date) < today || b.status === "completed",
    );

    const completed = bookings.filter((b) => b.status === "completed");
    const totalSpentMinor = completed.reduce(
      (sum, b) => sum + (typeof b.customer_pays === "number" ? b.customer_pays : 0),
      0,
    );
    const currency = completed.find((b) => b.currency)?.currency ?? null;

    setData({
      firstName,
      profileCompletion: completion,
      upcoming,
      history,
      stats: {
        completed: completed.length,
        upcoming: upcoming.length,
        totalSpentMinor,
        currency,
      },
    });
    setSliceErrors({ profile: profileRes.error, bookings: bookingsRes.error });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const error = aggregateError([sliceErrors.profile, sliceErrors.bookings]);

  return {
    data,
    loading: isLoading,
    isLoading,
    error,
    sliceErrors,
    refetch: load,
  };
}
