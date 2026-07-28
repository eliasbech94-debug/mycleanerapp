import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Customer dashboard aggregator hook.
 *
 * All queries hit real tables that already exist in Lovable Cloud
 * (`profiles`, `bookings`). No mock data, no fabricated numbers.
 * Runs queries in parallel and exposes typed slices + loading flag.
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
  loading: boolean;
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

const EMPTY: CustomerDashboardData = {
  loading: true,
  firstName: null,
  profileCompletion: null,
  upcoming: [],
  history: [],
  stats: { completed: 0, upcoming: 0, totalSpentMinor: 0, currency: null },
};

export function useCustomerDashboard(): CustomerDashboardData {
  const { user } = useAuth();
  const [data, setData] = useState<CustomerDashboardData>(EMPTY);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [profileRes, bookingsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name,phone,address,country_code")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("bookings")
          .select(
            "id,provider_name,service,hours,booking_date,slot,address,status,customer_pays,currency",
          )
          .eq("customer_user_id", user.id)
          .order("booking_date", { ascending: false })
          .limit(50),
      ]);

      if (cancelled) return;

      const profile = profileRes.data;
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
        loading: false,
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
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return data;
}
