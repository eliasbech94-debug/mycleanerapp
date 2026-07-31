// Authoritative recurring-booking quote wrapper.
// It delegates provider/market/dynamic-price validation to pricing-quote,
// then freezes the provider's platform-owned recurring discount on the quote.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { recalculateRecurringQuote } from "../_shared/recurringPricing.ts";

const BodySchema = z.object({
  recurrence: z.enum(["weekly", "biweekly", "monthly"]),
  provider_user_id: z.string().uuid().optional(),
  provider_id_text: z.string().min(1),
  service_category: z.string().min(1).max(64),
  currency: z.string().length(3),
  start_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480),
  address_place_id: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  quote_context: z.enum(["customer_checkout", "provider_preview", "admin_preview"]).default("customer_checkout"),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten().fieldErrors });
    const b = parsed.data;

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Resolve the provider ID before calling the standard quote endpoint.
    let providerUserId = b.provider_user_id ?? null;
    if (!providerUserId) {
      const { data: provider } = await admin
        .from("provider_profiles")
        .select("user_id")
        .eq("provider_slug", b.provider_id_text)
        .maybeSingle();
      providerUserId = provider?.user_id ?? null;
    }
    if (!providerUserId) return json(400, { error: "provider_not_found" });

    // Providers only opt in; the percentage and version come from platform config.
    const { data: discountRows, error: discountError } = await admin.rpc(
      "resolve_recurring_discount",
      { _provider_user_id: providerUserId, _recurrence: b.recurrence },
    );
    if (discountError) return json(500, { error: "recurring_discount_read_failed" });
    const discount = Array.isArray(discountRows) ? discountRows[0] : discountRows;
    if (!discount) return json(400, { error: "recurring_discount_not_offered" });

    // Reuse the existing authoritative quote path for provider, market, currency,
    // service, demand, holiday and launch-gate validation.
    const standardResponse = await fetch(`${url}/functions/v1/pricing-quote`, {
      method: "POST",
      headers: {
        Authorization: auth,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...b, recurrence: undefined }),
    });
    const standardBody = await standardResponse.json();
    if (!standardResponse.ok) return json(standardResponse.status, standardBody);

    const { data: quote, error: quoteError } = await admin
      .from("pricing_calculations")
      .select("*")
      .eq("id", standardBody.quote_id)
      .maybeSingle();
    if (quoteError || !quote) return json(500, { error: "quote_reload_failed" });
    if (quote.status !== "quoted") return json(409, { error: "quote_not_quotable" });

    const recalculated = recalculateRecurringQuote({
      baseRateMinor: Number(quote.base_rate_minor),
      totalAdjustmentBps: Number(quote.total_adjustment_bps ?? 0),
      durationMinutes: Number(quote.duration_minutes),
      commissionBps: Number(quote.commission_bps),
      discountBps: Number(discount.discount_bps),
    });

    const update = {
      recurrence: b.recurrence,
      recurring_discount_bps: Number(discount.discount_bps),
      recurring_discount_config_version: Number(discount.config_version),
      pre_discount_rate_minor: recalculated.preDiscountRateMinor,
      recurring_discount_minor: recalculated.recurringDiscountMinor,
      adjusted_rate_minor: recalculated.adjustedRateMinor,
      clamped_rate_minor: recalculated.adjustedRateMinor,
      subtotal_minor: recalculated.subtotalMinor,
      customer_total_minor: recalculated.customerTotalMinor,
      provider_net_minor: recalculated.providerNetMinor,
      platform_fee_minor: recalculated.platformFeeMinor,
    };

    const { data: frozen, error: updateError } = await admin
      .from("pricing_calculations")
      .update(update)
      .eq("id", quote.id)
      .eq("status", "quoted")
      .select("*")
      .single();
    if (updateError) return json(500, { error: "recurring_quote_freeze_failed", detail: updateError.message });

    return json(200, {
      quote_id: frozen.id,
      expires_at: frozen.expires_at,
      currency: frozen.currency,
      country_code: frozen.country_code,
      service_category: frozen.service_category,
      provider_user_id: frozen.provider_user_id,
      provider_id_text: frozen.provider_id_text,
      duration_minutes: frozen.duration_minutes,
      hours_billed: Number(frozen.hours_billed),
      recurrence: frozen.recurrence,
      recurring_discount_bps: frozen.recurring_discount_bps,
      pre_discount_rate_minor: frozen.pre_discount_rate_minor,
      recurring_discount_minor: frozen.recurring_discount_minor,
      final_rate_minor: frozen.clamped_rate_minor,
      subtotal_minor: frozen.subtotal_minor,
      platform_fee_minor: frozen.platform_fee_minor,
      customer_total_minor: frozen.customer_total_minor,
      provider_net_minor: frozen.provider_net_minor,
      pricing_mode: frozen.pricing_mode,
    });
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }
});
