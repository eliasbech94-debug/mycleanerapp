import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { monitored } from "../_shared/logger.ts";
import { renderPlatformFeeInvoice } from "../_shared/invoice-pdf.ts";
import { renderCustomerPlatformFeeInvoice, renderProviderServiceInvoice } from "../_shared/split-invoice-pdf.ts";
import { prorateSplit, splitMarketplaceAmounts } from "../_shared/marketplace-fee-split.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function decrypt(value: unknown): Promise<string | null> {
  const key = Deno.env.get("TAX_ENCRYPTION_KEY");
  if (!value || !key) return null;
  const { data } = await admin.rpc("tax_decrypt", { _ciphertext: value, _key: key });
  return (data as string | null) ?? null;
}

Deno.serve(monitored("invoice-issue-split", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { booking_id } = await req.json().catch(() => ({}));
    if (!booking_id) return json({ error: "booking_id_required" }, 400);

    const auth = req.headers.get("Authorization") ?? "";
    const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    if (!isService) {
      const ctx = await authenticate(req, corsHeaders);
      if (ctx instanceof Response) return ctx;
      if (!ctx.isSuperAdmin && !ctx.roles.includes("admin") && !ctx.roles.includes("employee")) {
        return json({ error: "forbidden" }, 403);
      }
    }

    const { data: booking, error: bookingError } = await admin.from("bookings")
      .select("id, customer_user_id, provider_id, service, booking_date, address, currency, customer_pays, provider_gets, refund_amount, payment_status")
      .eq("id", booking_id).maybeSingle();
    if (bookingError || !booking) return json({ error: "booking_not_found" }, 404);
    if (!["captured", "partially_refunded", "refunded"].includes(booking.payment_status)) {
      return json({ error: "booking_not_captured", payment_status: booking.payment_status }, 409);
    }

    const [{ data: customer }, { data: provider }] = await Promise.all([
      admin.from("profiles").select("id, full_name, country_code").eq("id", booking.customer_user_id).maybeSingle(),
      admin.from("profiles").select("id, full_name, country_code").eq("provider_id", booking.provider_id).maybeSingle(),
    ]);
    if (!customer?.id || !provider?.id) return json({ error: "party_profile_missing" }, 404);

    const { data: taxRow } = await admin.from("provider_tax_profiles")
      .select("*").eq("provider_user_id", provider.id).maybeSingle();
    const [businessName, businessAddress, vatNumber, taxId] = await Promise.all([
      decrypt(taxRow?.business_name_enc), decrypt(taxRow?.business_address_enc),
      decrypt(taxRow?.vat_number_enc), decrypt(taxRow?.tax_id_enc),
    ]);

    const country = (taxRow?.country_code ?? provider.country_code ?? "DK").toUpperCase();
    const { data: platform } = await admin.from("platform_tax_settings")
      .select("*").eq("country_code", country).maybeSingle();
    if (!platform) return json({ error: `platform_tax_settings_missing:${country}` }, 500);

    const rawSplit = splitMarketplaceAmounts(booking.customer_pays ?? 0, booking.provider_gets ?? 0);
    const split = prorateSplit(rawSplit, booking.refund_amount ?? 0);
    const currency = (booking.currency ?? "DKK").toUpperCase();
    const issuedAt = new Date().toISOString();
    const year = new Date().getUTCFullYear();
    const bookingRef = `MC-${booking.id.slice(0, 8).toUpperCase()}`;

    const platformVatRate = Number(platform.vat_rate ?? 0);
    const providerVatRate = taxRow?.vat_registered ? platformVatRate : 0;
    const customerFeeVat = Math.round(split.customerPlatformFee * platformVatRate / 100);
    const providerFeeVat = Math.round(split.providerPlatformFee * platformVatRate / 100);
    const serviceVat = providerVatRate > 0
      ? Math.round(split.serviceGross - split.serviceGross / (1 + providerVatRate / 100))
      : 0;
    const serviceSubtotal = split.serviceGross - serviceVat;

    const [{ data: customerExisting }, { data: serviceExisting }, { data: providerFeeExisting }] = await Promise.all([
      admin.from("customer_platform_fee_invoices").select("*").eq("booking_id", booking.id).maybeSingle(),
      admin.from("provider_service_invoices").select("*").eq("booking_id", booking.id).maybeSingle(),
      admin.from("platform_fee_invoices").select("*").eq("booking_id", booking.id).maybeSingle(),
    ]);

    const platformParty = {
      name: platform.legal_entity_name,
      address: platform.legal_entity_address,
      taxId: platform.tax_id,
      country,
    };
    const customerParty = { name: customer.full_name ?? "Customer", country: customer.country_code ?? country };
    const providerParty = {
      name: businessName || provider.full_name || "Provider",
      address: businessAddress,
      vat: vatNumber,
      taxId,
      country,
    };

    let customerInvoice = customerExisting;
    if (!customerInvoice) {
      const { data: num, error } = await admin.rpc("next_invoice_number", { _country_code: country });
      if (error) throw error;
      const invoiceNumber = String(num);
      const pdf = await renderCustomerPlatformFeeInvoice({
        invoiceNumber, issuedAt, bookingRef, currency,
        subtotal: split.customerPlatformFee,
        vatRate: platformVatRate,
        vatAmount: customerFeeVat,
        total: split.customerPlatformFee + customerFeeVat,
        platform: platformParty,
        customer: customerParty,
      });
      const path = `customer-platform-fee/${customer.id}/${year}/${invoiceNumber}.pdf`;
      const { error: uploadError } = await admin.storage.from("invoices").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await admin.from("customer_platform_fee_invoices").insert({
        invoice_number: invoiceNumber, booking_id: booking.id, customer_user_id: customer.id,
        currency, subtotal_amount: split.customerPlatformFee, vat_rate: platformVatRate,
        vat_amount: customerFeeVat, total_amount: split.customerPlatformFee + customerFeeVat,
        customer_snapshot: customerParty, platform_tax_snapshot: platformParty,
        pdf_storage_path: path, country_code: country,
        metadata: { booking_ref: bookingRef, fee_rate: 14 },
      }).select("*").single();
      if (insertError) throw insertError;
      customerInvoice = data;
    }

    let serviceInvoice = serviceExisting;
    if (!serviceInvoice) {
      const invoiceNumber = `PR-${year}-${booking.id.slice(0, 8).toUpperCase()}`;
      const pdf = await renderProviderServiceInvoice({
        invoiceNumber, issuedAt, bookingRef, currency,
        subtotal: serviceSubtotal, vatRate: providerVatRate,
        vatAmount: serviceVat, total: split.serviceGross,
        provider: providerParty, customer: customerParty,
        service: booking.service ?? "Rengøringsydelse",
      });
      const path = `provider-service/${provider.id}/${year}/${invoiceNumber}.pdf`;
      const { error: uploadError } = await admin.storage.from("invoices").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await admin.from("provider_service_invoices").insert({
        invoice_number: invoiceNumber, booking_id: booking.id,
        customer_user_id: customer.id, provider_user_id: provider.id,
        currency, service_subtotal_amount: serviceSubtotal, vat_rate: providerVatRate,
        vat_amount: serviceVat, total_amount: split.serviceGross,
        provider_tax_snapshot: providerParty, customer_snapshot: customerParty,
        pdf_storage_path: path, country_code: country,
        metadata: { booking_ref: bookingRef, generated_by: "MyCleaner_on_behalf_of_provider" },
      }).select("*").single();
      if (insertError) throw insertError;
      serviceInvoice = data;
    }

    let providerFeeInvoice = providerFeeExisting;
    if (!providerFeeInvoice) {
      const { data: num, error } = await admin.rpc("next_invoice_number", { _country_code: country });
      if (error) throw error;
      const invoiceNumber = String(num);
      const pdf = await renderPlatformFeeInvoice({
        invoice_number: invoiceNumber, issued_at: issuedAt, currency,
        subtotal: split.providerPlatformFee, vat_rate: platformVatRate,
        vat_amount: providerFeeVat, total: split.providerPlatformFee + providerFeeVat,
        vat_treatment: "standard", booking_ref: bookingRef, booking_id: booking.id,
        booking_gross: split.serviceGross, commission_pct: 14,
        issuer: platformParty, provider: providerParty,
      });
      const path = `platform-fee/${provider.id}/${year}/${invoiceNumber}.pdf`;
      const { error: uploadError } = await admin.storage.from("invoices").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await admin.from("platform_fee_invoices").insert({
        invoice_number: invoiceNumber, booking_id: booking.id, provider_user_id: provider.id,
        provider_tax_snapshot: providerParty, platform_tax_snapshot: platformParty,
        currency, subtotal_amount: split.providerPlatformFee, vat_rate: platformVatRate,
        vat_amount: providerFeeVat, total_amount: split.providerPlatformFee + providerFeeVat,
        vat_treatment: "standard", pdf_storage_path: path, country_code: country,
        metadata: { booking_ref: bookingRef, commission_pct: 14, split_invoice_model: true },
      }).select("*").single();
      if (insertError) throw insertError;
      providerFeeInvoice = data;
    }

    return json({
      ok: true,
      split,
      customer_documents: [customerInvoice, serviceInvoice],
      provider_documents: [providerFeeInvoice],
    });
  } catch (error) {
    console.error("invoice-issue-split failed", error);
    return json({ error: (error as Error).message }, 500);
  }
}));
