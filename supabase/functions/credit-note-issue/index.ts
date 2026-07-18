// Issues a Platform Credit Note when a Stripe refund settles.
// Called by:
//   • stripe-webhook (service-role) after refund succeeds
//   • admins manually (recovery / backfill)
// Idempotent per (original_invoice_id, stripe_refund_id).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import { renderCreditNote } from "../_shared/invoice-pdf.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    let isAdmin = false;
    if (!isService) {
      const ctx = await authenticate(req, corsHeaders);
      if (ctx instanceof Response) return ctx;
      isAdmin = ctx.isSuperAdmin || ctx.roles.includes("admin");
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const booking_id: string | undefined = body.booking_id;
    const stripe_refund_id: string | null = body.stripe_refund_id ?? null;
    if (!booking_id) return json({ error: "booking_id_required" }, 400);

    // Load booking + original invoice
    const { data: booking } = await admin.from("bookings")
      .select("id, provider_id, currency, customer_pays, platform_fee_amount, refund_amount, booking_date, address")
      .eq("id", booking_id).maybeSingle();
    if (!booking) return json({ error: "booking_not_found" }, 404);

    const { data: originalInvoice } = await admin.from("platform_fee_invoices")
      .select("*").eq("booking_id", booking_id).maybeSingle();
    if (!originalInvoice) return json({ error: "original_invoice_not_found" }, 404);

    const currency = (booking.currency ?? "DKK").toUpperCase();
    const grossPaid = booking.customer_pays ?? 0;
    const refundAmount = booking.refund_amount ?? 0;
    if (refundAmount <= 0) return json({ error: "no_refund_to_credit" }, 409);
    const refundType: "partial" | "full" = refundAmount >= grossPaid ? "full" : "partial";

    // Idempotency: skip if already exists for this (invoice, refund).
    const { data: existing } = await admin.from("platform_credit_notes")
      .select("id, credit_note_number, pdf_storage_path")
      .eq("original_invoice_id", originalInvoice.id)
      .eq("stripe_refund_id", stripe_refund_id ?? "").maybeSingle();

    // Sum previously credited amount to compute delta-to-credit.
    const { data: priorCredits } = await admin.from("platform_credit_notes")
      .select("refund_amount, reversed_subtotal, reversed_vat_amount, reversed_total")
      .eq("original_invoice_id", originalInvoice.id);
    const alreadyCreditedGross = (priorCredits ?? []).reduce((s, r) => s + (r.refund_amount ?? 0), 0);

    if (existing) {
      return json({ ok: true, idempotent: true, credit_note: existing });
    }

    // Compute proportional reversal of platform-fee invoice components.
    // fee_share = (refund_gross - already_credited_gross) / gross_paid
    const deltaRefund = Math.max(0, refundAmount - alreadyCreditedGross);
    if (deltaRefund === 0) return json({ ok: true, no_delta: true });

    const share = grossPaid > 0 ? deltaRefund / grossPaid : 0;
    const reversedSubtotal = Math.round((originalInvoice.subtotal_amount ?? 0) * share);
    const reversedVat = Math.round((originalInvoice.vat_amount ?? 0) * share);
    const reversedTotal = reversedSubtotal + reversedVat;

    // Numbering (per platform country)
    const platformCountry = (originalInvoice.platform_tax_snapshot?.country_code ?? "DK").toUpperCase();
    const { data: cnNum, error: numErr } = await admin.rpc("next_credit_note_number", {
      _country_code: platformCountry,
    });
    if (numErr) return json({ error: `numbering_failed: ${numErr.message}` }, 500);
    const creditNoteNumber = cnNum as unknown as string;

    // Resolve provider display info for the PDF
    const providerUserId = originalInvoice.provider_user_id;
    const { data: prof } = await admin.from("profiles")
      .select("full_name").eq("id", providerUserId).maybeSingle();
    const providerSnap = originalInvoice.provider_tax_snapshot ?? {};
    const platformSnap = originalInvoice.platform_tax_snapshot ?? {};
    const bookingRef = `MC-${booking.id.slice(0, 8).toUpperCase()}`;

    const pdfBytes = await renderCreditNote({
      credit_note_number: creditNoteNumber,
      original_invoice_number: originalInvoice.invoice_number,
      issued_at: new Date().toISOString(),
      currency,
      reversed_subtotal: reversedSubtotal,
      vat_rate: Number(originalInvoice.vat_rate ?? 0),
      reversed_vat_amount: reversedVat,
      reversed_total: reversedTotal,
      vat_treatment: originalInvoice.vat_treatment ?? "standard",
      refund_type: refundType,
      booking_ref: bookingRef,
      booking_id: booking.id,
      refund_amount: deltaRefund,
      stripe_refund_id,
      issuer: {
        name: platformSnap.legal_entity_name ?? "MyCleaner",
        address: platformSnap.legal_entity_address ?? undefined,
        taxId: platformSnap.tax_id ?? undefined,
        country: platformSnap.country_code ?? platformCountry,
      },
      provider: {
        name: providerSnap.business_name || prof?.full_name || "Provider",
        address: providerSnap.business_address ?? undefined,
        vat: providerSnap.vat_number ?? undefined,
        taxId: providerSnap.tax_id ?? undefined,
        country: providerSnap.country_code ?? platformCountry,
      },
    });

    const path = `credit-notes/${providerUserId}/${new Date().getUTCFullYear()}/${creditNoteNumber}.pdf`;
    await admin.storage.from("invoices").upload(path, pdfBytes, {
      contentType: "application/pdf", upsert: true,
    });

    const { data: inserted, error: insErr } = await admin.from("platform_credit_notes").insert({
      credit_note_number: creditNoteNumber,
      booking_id: booking.id,
      provider_user_id: providerUserId,
      original_invoice_id: originalInvoice.id,
      stripe_refund_id,
      currency,
      refund_amount: deltaRefund,
      refund_type: refundType,
      reversed_subtotal: reversedSubtotal,
      vat_rate: Number(originalInvoice.vat_rate ?? 0),
      reversed_vat_amount: reversedVat,
      reversed_total: reversedTotal,
      vat_treatment: originalInvoice.vat_treatment ?? "standard",
      provider_tax_snapshot: providerSnap,
      platform_tax_snapshot: platformSnap,
      pdf_storage_path: path,
      metadata: { booking_ref: bookingRef, share_percent: Math.round(share * 10000) / 100 },
    }).select("*").maybeSingle();
    if (insErr) return json({ error: `credit_note_insert_failed: ${insErr.message}` }, 500);

    // Recalc settlement statement to reflect refund-adjusted numbers.
    const netGross = Math.max(0, grossPaid - refundAmount);
    const feeRaw = booking.platform_fee_amount ?? 0;
    const adjustedFee = grossPaid > 0 ? Math.round(feeRaw * (netGross / grossPaid)) : 0;
    const { data: stmt } = await admin.from("provider_settlement_statements")
      .select("id, gross_amount").eq("booking_id", booking.id).maybeSingle();
    if (stmt) {
      await admin.from("provider_settlement_statements").update({
        refund_amount: refundAmount,
        platform_fee_amount: adjustedFee,
        provider_net_amount: Math.max(0, netGross - adjustedFee),
      }).eq("id", stmt.id);
    }

    return json({ ok: true, credit_note: inserted });
  } catch (e) {
    console.error("credit-note-issue failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
