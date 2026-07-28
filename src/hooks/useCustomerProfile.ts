import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CustomerAddress } from "@/lib/customerAddresses";

/**
 * useCustomerProfile — aggregator for the Customer Profile v2 overview.
 *
 * Real data only, from tables that already exist:
 *   - `profiles`               (identity, contact, notification prefs, tax)
 *   - `customer_addresses`     (saved addresses + preferences + access)
 *   - `bookings`               (booking summary, member-since fallback)
 *   - `auth.users` via session (email, created_at for "member since")
 *
 * No fabricated data. Missing values surface as `null` so the UI can
 * render honest "Kommer snart"/empty states.
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
  loading: boolean;
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
  reload: () => void;
}

const EMPTY: CustomerProfileData = {
  loading: true,
  profile: null,
  email: null,
  memberSince: null,
  addresses: [],
  primaryAddress: null,
  bookings: { total: 0, upcoming: 0, completed: 0, lastBookingAt: null },
  completion: 0,
  reload: () => {},
};

export function useCustomerProfile(): CustomerProfileData {
  const { user } = useAuth();
  const [data, setData] = useState<CustomerProfileData>(EMPTY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [profileRes, addrRes, bookingsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("customer_addresses" as any)
          .select("*")
          .eq("user_id", user.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("bookings")
          .select("id,status,booking_date")
          .eq("customer_user_id", user.id),
      ]);

      if (cancelled) return;

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
        bookings
          .map((b) => b.booking_date)
          .sort()
          .slice(-1)[0] ?? null;

      // Profile completion — same 4-field baseline as dashboard hook plus
      // "at least one saved address" as a fifth signal.
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
        profile?.created_at ??
        (user as any)?.created_at ??
        null;

      setData({
        loading: false,
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
        reload: () => setTick((t) => t + 1),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, tick]);

  return data;
}
