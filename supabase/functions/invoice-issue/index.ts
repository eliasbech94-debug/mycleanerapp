// Issues a Platform Fee Invoice + a Provider Settlement Statement for a
// booking. Idempotent: safe to call multiple times for the same booking_id.
// Never mutates bookings, payments, Stripe or existing finance tables.
//
// Call auth: admin/employee, service-role (from stripe-webhook), or a provider
// requesting for their own booking.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { renderPlatformFeeInvoice, renderSettlementStatement } from "../_shared/invoice-pdf.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const booking_id: string | undefined = body.booking_id;
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    // Auth: service-role bypass OR authenticated user (admin or the booking's provider).
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    let callerUserId: string | null = null;
    let isAdmin = false;
    if (!isService) {
      const ctx = await authenticate(req, corsHeaders);
      if (ctx instanceof Response) return ctx;
      callerUserId = ctx.user.id;
      isAdmin = ctx.isSuperAdmin || ctx.roles.includes("admin") || ctx.roles.includes("employee");
    }

    // Load booking
    const { data: booking, error: bkErr } = await admin
      .from("bookings")
      .select("id, customer_user_id, provider_id, provider_name, service, booking_date, address, currency, customer_pays, provider_gets, platform_fee_amount, refund_amount, payment_status, provider_stripe_account_id")
      .eq("id", booking_id)
      .maybeSingle();
    if (bkErr || !booking) return json({ error: "booking_not_found" }, 404);
    if (!["captured", "partially_refunded", "refunded"].includes(booking.payment_status)) {
      return json({ error: "booking_not_captured", payment_status: booking.payment_status }, 409);
    }

    // Resolve provider profile → user id
    const { data: provProfile } = await admin.from("profiles")
      .select("id, full_name")
      .eq("provider_id", booking.provider_id).maybeSingle();
    if (!provProfile?.id) return json({ error: "provider_profile_missing" }, 404);
    const providerUserId = provProfile.id;

    if (!isService && !isAdmin && callerUserId !== providerUserId) {
      return json({ error: "forbidden" }, 403);
    }

    // Provider tax profile
    let { data: taxProfileRow } = await admin.from("provider_tax_profiles")
      .select("*").eq("provider_user_id", providerUserId).maybeSingle();
    if (!taxProfileRow) {
      // Auto-seed with country from profiles.country_code if present
      const { data: prof } = await admin.from("profiles")
        .select("country_code, tax_type").eq("id", providerUserId).maybeSingle();
      const defaults = {
        provider_user_id: providerUserId,
        country_code: (prof?.country_code ?? "DK").toUpperCase(),
        provider_type: prof?.tax_type === "business" ? "business" : "private",
        vat_registered: false,
      };
      const { data: created } = await admin.from("provider_tax_profiles")
        .insert(defaults).select("*").maybeSingle();
      taxProfileRow = created;
    }

    // Decrypt sensitive tax fields for invoice/snapshot rendering.
    const TAX_KEY = Deno.env.get("TAX_ENCRYPTION_KEY");
    async function dec(v: unknown): Promise<string | null> {
      if (!v || !TAX_KEY) return null;
      const { data } = await admin.rpc("tax_decrypt", { _ciphertext: v, _key: TAX_KEY });
      return (data as string | null) ?? null;
    }
    const [_vatNum, _bizName, _bizAddr, _taxId] = await Promise.all([
      dec(taxProfileRow?.vat_number_enc),
      dec(taxProfileRow?.business_name_enc),
      dec(taxProfileRow?.business_address_enc),
      dec(taxProfileRow?.tax_id_enc),
    ]);
    const taxProfile = taxProfileRow
      ? { ...taxProfileRow, vat_number: _vatNum, business_name: _bizName, business_address: _bizAddr, tax_id: _taxId }
      : null;

    // Platform tax settings — use provider country as invoicing country
    // (MyCleaner invoices in the market where the service is delivered).
    const platformCountry = (taxProfile?.country_code ?? "DK").toUpperCase();
    const { data: platformTax } = await admin.from("platform_tax_settings")
      .select("*").eq("country_code", platformCountry).maybeSingle();
    if (!platformTax) return json({ error: `platform_tax_settings_missing:${platformCountry}` }, 500);

    // Currency + numbers
    const currency = (booking.currency ?? "DKK").toUpperCase();
    const gross = booking.customer_pays ?? 0;
    const refund = booking.refund_amount ?? 0;
    const netGross = Math.max(0, gross - refund);
    // Platform fee is refund-adjusted, matching finance-summary logic.
    const feeRaw = booking.platform_fee_amount ?? 0;
    const platformFee = gross > 0 ? Math.round(feeRaw * (netGross / gross)) : 0;
    const providerGetsRaw = booking.provider_gets ?? 0;
    const providerNet = gross > 0 ? Math.round(providerGetsRaw * (netGross / gross)) : 0;
    const commissionPct = 28;

    // VAT treatment for the platform fee invoice
    let vatTreatment = "standard";
    let vatRate = Number(platformTax.vat_rate ?? 0);
    if (taxProfile?.vat_registered && taxProfile.country_code !== platformTax.country_code
        && platformTax.reverse_charge_eu) {
      vatTreatment = "reverse_charge";
      vatRate = 0;
    } else if (!platformTax.reverse_charge_eu && taxProfile?.country_code !== platformTax.country_code) {
      vatTreatment = "outside_scope";
      vatRate = 0;
    }
    const vatAmount = Math.round(platformFee * (vatRate / 100));
    const invoiceTotal = platformFee + vatAmount;
    const bookingRef = `MC-${booking.id.slice(0, 8).toUpperCase()}`;

    // Idempotent lookups
    const [{ data: existingInvoice }, { data: existingStatement }] = await Promise.all([
      admin.from("platform_fee_invoices").select("id, invoice_number, pdf_storage_path")
        .eq("booking_id", booking.id).maybeSingle(),
      admin.from("provider_settlement_statements").select("id, statement_number, pdf_storage_path")
        .eq("booking_id", booking.id).maybeSingle(),
    ]);

    // Snapshots
    const providerSnapshot = {
      country_code: taxProfile?.country_code, provider_type: taxProfile?.provider_type,
      vat_registered: taxProfile?.vat_registered, vat_number: taxProfile?.vat_number,
      business_name: taxProfile?.business_name, business_address: taxProfile?.business_address,
      tax_id: taxProfile?.tax_id, full_name: provProfile.full_name,
    };
    const platformSnapshot = {
      country_code: platformTax.country_code, legal_entity_name: platformTax.legal_entity_name,
      legal_entity_address: platformTax.legal_entity_address, tax_id: platformTax.tax_id,
      vat_rate: Number(platformTax.vat_rate), reverse_charge_eu: platformTax.reverse_charge_eu,
    };

    // Related payout (best-effort)
    const { data: payout } = await admin.from("finance_payouts")
      .select("status, stripe_transfer_id, stripe_payout_id")
      .eq("booking_id", booking.id).maybeSingle();

    // === Platform Fee Invoice ===
    let invoiceRow = existingInvoice;
    if (!invoiceRow) {
      const { data: numRow, error: numErr } = await admin
        .rpc("next_invoice_number", { _country_code: platformTax.country_code });
      if (numErr) return json({ error: `numbering_failed: ${numErr.message}` }, 500);
      const invoiceNumber = numRow as unknown as string;

      const pdfBytes = await renderPlatformFeeInvoice({
        invoice_number: invoiceNumber, issued_at: new Date().toISOString(),
        currency, subtotal: platformFee, vat_rate: vatRate, vat_amount: vatAmount,
        total: invoiceTotal, vat_treatment: vatTreatment,
        booking_ref: bookingRef, booking_id: booking.id, booking_gross: netGross,
        commission_pct: commissionPct,
        issuer: {
          name: platformTax.legal_entity_name,
          address: platformTax.legal_entity_address ?? undefined,
          taxId: platformTax.tax_id ?? undefined,
          country: platformTax.country_code,
        },
        provider: {
          name: taxProfile?.business_name || provProfile.full_name || "Provider",
          address: taxProfile?.business_address ?? undefined,
          vat: taxProfile?.vat_number ?? undefined,
          taxId: taxProfile?.tax_id ?? undefined,
          country: taxProfile?.country_code ?? platformTax.country_code,
        },
      });
      const path = `platform-fee/${providerUserId}/${new Date().getUTCFullYear()}/${invoiceNumber}.pdf`;
      await admin.storage.from("invoices").upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });

      const { data: inserted, error: insErr } = await admin.from("platform_fee_invoices").insert({
        invoice_number: invoiceNumber, booking_id: booking.id, provider_user_id: providerUserId,
        provider_tax_snapshot: providerSnapshot, platform_tax_snapshot: platformSnapshot,
        currency, subtotal_amount: platformFee, vat_rate: vatRate, vat_amount: vatAmount,
        total_amount: invoiceTotal, vat_treatment: vatTreatment,
        pdf_storage_path: path,
        metadata: { booking_ref: bookingRef, commission_pct: commissionPct },
      }).select("*").maybeSingle();
      if (insErr) return json({ error: `invoice_insert_failed: ${insErr.message}` }, 500);
      invoiceRow = inserted as any;
    }

    // === Provider Settlement Statement ===
    let statementRow = existingStatement;
    if (!statementRow) {
      // Statement numbering: SR-YYYY-<invoice_seq>, mirrors invoice year but its
      // own prefix so it can never be confused with a MyCleaner sales invoice.
      const statementNumber = invoiceRow!.invoice_number.replace(/^[A-Z]+/, "SR");

      const { data: customer } = await admin.from("profiles")
        .select("full_name").eq("id", booking.customer_user_id).maybeSingle();

      const pdfBytes = await renderSettlementStatement({
        statement_number: statementNumber, issued_at: new Date().toISOString(),
        currency, gross, refund, platform_fee: platformFee, provider_net: providerNet,
        booking_ref: bookingRef, booking_id: booking.id,
        service_date: booking.booking_date ?? null,
        service_address: booking.address ?? null,
        customer: customer?.full_name ?? null,
        payout_status: payout?.status ?? "pending",
        linked_transfer_id: payout?.stripe_transfer_id ?? null,
        linked_payout_id: payout?.stripe_payout_id ?? null,
        issuer: {
          name: platformTax.legal_entity_name,
          address: platformTax.legal_entity_address ?? undefined,
          country: platformTax.country_code,
        },
        provider: {
          name: taxProfile?.business_name || provProfile.full_name || "Provider",
          address: taxProfile?.business_address ?? undefined,
          vat: taxProfile?.vat_number ?? undefined,
          taxId: taxProfile?.tax_id ?? undefined,
          country: taxProfile?.country_code ?? platformTax.country_code,
          type: taxProfile?.provider_type ?? "private",
          vat_registered: !!taxProfile?.vat_registered,
        },
      });
      const path = `settlements/${providerUserId}/${new Date().getUTCFullYear()}/${statementNumber}.pdf`;
      await admin.storage.from("invoices").upload(path, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });

      const { data: inserted, error: sErr } = await admin.from("provider_settlement_statements").insert({
        statement_number: statementNumber, booking_id: booking.id, provider_user_id: providerUserId,
        customer_display_name: customer?.full_name ?? null,
        service_date: booking.booking_date ?? null,
        service_address: booking.address ?? null,
        currency, gross_amount: gross, refund_amount: refund,
        platform_fee_amount: platformFee, provider_net_amount: providerNet,
        provider_tax_snapshot: providerSnapshot,
        payout_status: payout?.status ?? "pending",
        linked_transfer_id: payout?.stripe_transfer_id ?? null,
        linked_payout_id: payout?.stripe_payout_id ?? null,
        pdf_storage_path: path,
        metadata: { booking_ref: bookingRef },
      }).select("*").maybeSingle();
      if (sErr) return json({ error: `statement_insert_failed: ${sErr.message}` }, 500);
      statementRow = inserted as any;
    }

    return json({
      ok: true,
      invoice: invoiceRow,
      statement: statementRow,
    });
  } catch (e) {
    console.error("invoice-issue failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
