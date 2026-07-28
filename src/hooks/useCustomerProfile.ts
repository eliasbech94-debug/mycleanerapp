import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CustomerAddress } from "@/lib/customerAddresses";
import { safeQuery, aggregateError } from "@/hooks/lib/safeQuery";

/**
 * useCustomerProfile — aggregator for the Customer Profile v2 overview.
 *
 * Real data only, from tables that already exist. Errors from any slice
 * are captured per-section so a single failed query never removes data
 * returned by the others.
 */

export type CustomerProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  address_country_code: string | null;
  country_code: string | null;
  sms_phone: string | null;
  sms_verified_at: string | null;
  ui_language: string | null;
  marketplace_country: string | null;
  notification_prefs: Record<string, unknown> | null;
  tax_type: string | null;
  tax_municipality: string | null;
  tax_id_last4: string | null;
  deactivated_at: string | null;
  created_at: string | null;
};

export interface CustomerProfileData {
  profile: CustomerProfileRow | null;
  email: string | null;
  memberSince: string | null;
  addresses: CustomerAddress[];
  primaryAddress: CustomerAddress | null;
  bookings: {
    total: number;
    upcoming: number;
    completed: number;
    lastBookingAt: string | null;
  };
  completion: number;
}

export type CustomerProfileResult = CustomerProfileData & {
  data: CustomerProfileData;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  sliceErrors: {
    profile: string | null;
    addresses: string | null;
    bookings: string | null;
  };
  refetch: () => Promise<void>;
  /** Legacy alias for {@link refetch}. */
  reload: () => Promise<void>;
};

const EMPTY_DATA: CustomerProfileData = {
  profile: null,
  email: null,
  memberSince: null,
  addresses: [],
  primaryAddress: null,
  bookings: { total: 0, upcoming: 0, completed: 0, lastBookingAt: null },
  completion: 0,
};

export function useCustomerProfile(): CustomerProfileResult {
  const { user } = useAuth();
  const [data, setData] = useState<CustomerProfileData>(EMPTY_DATA);
  const [isLoading, setLoading] = useState(true);
  const [sliceErrors, setSliceErrors] = useState({
    profile: null as string | null,
    addresses: null as string | null,
    bookings: null as string | null,
  });

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [profileRes, addrRes, bookingsRes] = await Promise.all([
      safeQuery(
        "customer.profile",
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      ),
      safeQuery(
        "customer.addresses",
        (supabase as any)
          .from("customer_addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
      ),
      safeQuery(
        "customer.bookings",
        supabase
          .from("bookings")
          .select("id,status,booking_date")
          .eq("customer_user_id", user.id),
      ),
    ]);

    const profile = (profileRes.data ?? null) as CustomerProfileRow | null;
    const addresses = (addrRes.data ?? []) as unknown as CustomerAddress[];
    const bookings = (bookingsRes.data ?? []) as Array<{
      id: string;
      status: string;
      booking_date: string;
    }>;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = bookings.filter(
      (b) =>
        new Date(b.booking_date) >= today &&
        b.status !== "cancelled" &&
        b.status !== "declined",
    ).length;
    const completed = bookings.filter((b) => b.status === "completed").length;
    const lastBookingAt =
      bookings.map((b) => b.booking_date).sort().slice(-1)[0] ?? null;

    const signals = [
      !!profile?.full_name,
      !!profile?.phone,
      !!profile?.address,
      !!profile?.country_code,
      addresses.length > 0,
    ];
    const filled = signals.filter(Boolean).length;
    const completion = Math.round((filled / signals.length) * 100);

    const memberSince =
      profile?.created_at ?? (user as any)?.created_at ?? null;

    setData({
      profile,
      email: user.email ?? null,
      memberSince,
      addresses,
      primaryAddress: addresses.find((a) => a.is_primary) ?? addresses[0] ?? null,
      bookings: {
        total: bookings.length,
        upcoming,
        completed,
        lastBookingAt,
      },
      completion,
    });
    setSliceErrors({
      profile: profileRes.error,
      addresses: addrRes.error,
      bookings: bookingsRes.error,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const error = aggregateError([
    sliceErrors.profile,
    sliceErrors.addresses,
    sliceErrors.bookings,
  ]);

  return {
    ...data,
    data,
    loading: isLoading,
    isLoading,
    error,
    sliceErrors,
    refetch: load,
    reload: load,
  };

}
