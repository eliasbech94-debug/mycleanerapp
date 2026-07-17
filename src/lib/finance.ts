// Currency + minor-unit helpers for the finance module.
export function formatMoney(minor: number | null | undefined, currency = "DKK") {
  const value = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("da-DK", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

export interface FinanceSummary {
  scope: "provider" | "admin";
  isAdmin: boolean;
  currency: string;
  totals: {
    gross_revenue: number;
    platform_commission: number;
    provider_net: number;
    bookings_count: number;
  };
  payouts: {
    totals: { paid: number; in_transit: number; failed: number };
    items: Array<{
      id: string;
      booking_id: string | null;
      stripe_transfer_id: string | null;
      stripe_payout_id: string | null;
      gross_amount: number;
      platform_fee_amount: number;
      net_amount: number;
      currency: string;
      status: string;
      arrival_date: string | null;
      created_at: string;
    }>;
  };
  monthly: Array<{ month: string; gross: number; fee: number; net: number; count: number }>;
  bookings: Array<{
    id: string;
    customer_pays: number;
    provider_gets: number;
    platform_fee_amount: number;
    currency: string;
    payment_status: string;
    status: string;
    booking_date: string;
    provider_name: string;
  }>;
}
