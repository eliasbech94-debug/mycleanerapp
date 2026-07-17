// Types + fetch helpers for the invoicing module.
import { supabase } from "@/integrations/supabase/client";

export interface PlatformFeeInvoice {
  id: string;
  invoice_number: string;
  booking_id: string;
  provider_user_id: string;
  currency: string;
  subtotal_amount: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  vat_treatment: "standard" | "reverse_charge" | "exempt" | "outside_scope";
  status: "issued" | "void";
  issued_at: string;
  pdf_storage_path: string | null;
  platform_tax_snapshot?: { country_code?: string; legal_entity_name?: string } | null;
  provider_tax_snapshot?: { business_name?: string; full_name?: string; country_code?: string } | null;
}

export interface SettlementStatement {
  id: string;
  statement_number: string;
  booking_id: string;
  provider_user_id: string;
  currency: string;
  gross_amount: number;
  refund_amount: number;
  platform_fee_amount: number;
  provider_net_amount: number;
  payout_status: string;
  issued_at: string;
  pdf_storage_path: string | null;
  service_date: string | null;
  customer_display_name: string | null;
}

export interface ProviderTaxProfile {
  id?: string;
  provider_user_id?: string;
  country_code: string;
  provider_type: "private" | "business";
  vat_registered: boolean;
  vat_number: string | null;
  business_name: string | null;
  business_address: string | null;
  tax_id: string | null;
}

export async function fetchInvoicesList(scope: "provider" | "admin") {
  const { data, error } = await supabase.functions.invoke(
    `invoice-list?scope=${scope}`,
    { method: "GET" as any },
  );
  if (error) throw error;
  return data as { invoices: PlatformFeeInvoice[]; statements: SettlementStatement[] };
}

export async function fetchInvoiceDownloadUrl(kind: "invoice" | "statement", id: string) {
  const { data, error } = await supabase.functions.invoke(
    `invoice-download?kind=${kind}&id=${id}`,
    { method: "GET" as any },
  );
  if (error) throw error;
  return (data as { url: string }).url;
}
