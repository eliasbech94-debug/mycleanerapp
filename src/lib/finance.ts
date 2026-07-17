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

export interface CurrencyTotals {
  currency: string;
  gross_revenue: number;
  refunded_amount: number;
  platform_commission: number;
  provider_net: number;
  bookings_count: number;
  refunds_count: number;
}

export interface PayoutCurrencyTotals {
  currency: string;
  paid: number;
  in_transit: number;
  failed: number;
}

export interface FinanceSummary {
  scope: "provider" | "admin";
  isAdmin: boolean;
  totals_by_currency: CurrencyTotals[];
  payouts: {
    totals_by_currency: PayoutCurrencyTotals[];
    items: Array<{
      id: string;
      booking_id: string | null;
      stripe_transfer_id: string | null;
      stripe_payout_id: string | null;
      stripe_charge_id: string | null;
      stripe_payment_intent_id: string | null;
      gross_amount: number;
      platform_fee_amount: number;
      net_amount: number;
      currency: string;
      status: string;
      arrival_date: string | null;
      created_at: string;
      metadata?: Record<string, unknown> | null;
    }>;
  };
  monthly: Array<{ month: string; currency: string; gross: number; refunded: number; fee: number; net: number; count: number }>;
  bookings: Array<{
    id: string;
    customer_pays: number;
    provider_gets: number;
    platform_fee_amount: number;
    refund_amount: number | null;
    currency: string;
    payment_status: string;
    status: string;
    booking_date: string;
    provider_name: string;
  }>;
}
