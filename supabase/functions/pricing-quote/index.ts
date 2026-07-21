// pricing-quote — Phase 1. Feature-flag gated (disabled by default).
// Returns a customer-safe DTO. Internal pricing_calculations row is created
// via service-role, never exposed directly to the client.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import {
  applyCommission, classifyDemand, clampRate, computeAdjustment,
  locationFingerprint, quoteContextKey, roundHalfAway, splitCommissionBps,
} from "../_shared/pricing.ts";

const BodySchema = z.object({
  provider_user_id: z.string().uuid(),
  provider_id_text: z.string().min(1),
  country_code: z.string().length(2),
  service_category: z.string().min(1).max(64),
  currency: z.string().length(3),
  start_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480),
  address_place_id: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  quote_context: z.enum(["customer_checkout", "provider_preview", "admin_preview"]).default("customer_checkout"),
});

const QUOTE_TTL_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const requesterId = claims?.claims?.sub as string | undefined;
    if (!requesterId) return json(401, { error: "Unauthorized" });

    const admin = createClient(url, svc, { auth: { persistSession: false } });

    // Feature flag gate — Phase 1 disabled by default.
    const { data: flag } = await admin
      .from("feature_flags").select("enabled")
      .eq("flag_key", "dynamic_pricing.enabled").maybeSingle();
    if (!flag?.enabled) return json(503, { error: "dynamic_pricing_disabled" });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten().fieldErrors });
    const b = parsed.data;

    // Country config (existing published-config helper)
    const { data: cfgRows, error: cfgErr } = await admin
      .rpc("get_published_country_config", { _iso: b.country_code.toUpperCase() });
    if (cfgErr) return json(500, { error: "country_config_read_failed" });
    const cc = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
    if (!cc) return json(400, { error: "country_not_launched" });
    if (String(cc.currency).toUpperCase() !== b.currency.toUpperCase()) {
      return json(400, { error: "currency_country_mismatch" });
    }
    const commissionBps: number = cc.commission_bps;
    const countryMinRateMinor: number =
      Number((cc.config as Record<string, unknown> | null)?.["min_hourly_rate_minor"] ?? 0) || 0;

    // Provider settings — exact provider+country+category
    const { data: pps } = await admin
      .from("provider_pricing_settings").select("*")
      .eq("provider_user_id", b.provider_user_id)
      .eq("country_code", b.country_code.toUpperCase())
      .eq("service_category", b.service_category)
      .maybeSingle();

    // Fallback: provider_profiles.hourly_rate
    const { data: prof } = await admin
      .from("provider_profiles").select("hourly_rate,service_categories")
      .eq("user_id", b.provider_user_id).maybeSingle();

    const dynamicEligible = !!(pps && pps.enabled);
    const baseRateMinor = dynamicEligible ? pps!.base_rate_minor : (prof?.hourly_rate ?? 0);
    const providerMin = dynamicEligible ? pps!.min_rate_minor : baseRateMinor;
    const providerMax = dynamicEligible ? pps!.max_rate_minor : baseRateMinor;
    const allowDecrease = dynamicEligible ? pps!.allow_decrease : false;
    const allowIncrease = dynamicEligible ? pps!.allow_increase : false;

    if (baseRateMinor <= 0) return json(400, { error: "provider_rate_unavailable" });

    // Dynamic config resolver (deterministic)
    const { data: dpc } = await admin
      .rpc("resolve_dynamic_pricing_config", { _country: b.country_code, _category: b.service_category });
    const dpcRow = Array.isArray(dpc) ? dpc[0] : dpc;
    const dpcEnabled = !!(dpcRow && dpcRow.enabled);

    // Demand: real bookings only (never quotes, never previews).
    const startAt = new Date(b.start_at);
    const winStart = new Date(startAt.getTime() - 2 * 3600_000).toISOString();
    const winEnd = new Date(startAt.getTime() + 2 * 3600_000).toISOString();
    const { count: demandCount } = await admin
      .from("bookings").select("id", { count: "exact", head: true })
      .eq("country_code", b.country_code.toUpperCase())
      .eq("service", b.service_category)
      .in("status", ["pending", "confirmed"])
      .in("payment_status", ["authorized", "captured", "requires_action"])
      .gte("booking_date", winStart.slice(0, 10))
      .lte("booking_date", winEnd.slice(0, 10));

    // Supply proxy — active providers with matching country + category.
    const { count: supplyCount } = await admin
      .from("provider_profiles").select("user_id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("country_code", b.country_code.toUpperCase())
      .contains("service_categories", [b.service_category]);

    const supply = Math.max(supplyCount ?? 0, 0);
    const demand = Math.max(demandCount ?? 0, 0);
    const demandRatioBps = Math.round((demand * 10000) / Math.max(supply, 1));

    let mode: "static" | "dynamic" = "static";
    let band: "very_low" | "low" | "normal" | "high" | "very_high" = "normal";
    let demandBandBps = 0;
    let adj = { weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0, total_adjustment_bps: 0 };
    let failReason: string | null = null;

    if (dynamicEligible && dpcEnabled && supply >= (dpcRow!.min_supply_for_dynamic ?? 0)) {
      // Invariant checks
      if (providerMax < countryMinRateMinor || providerMin < countryMinRateMinor) {
        failReason = "provider_max_below_country_min";
      } else {
        mode = "dynamic";
        band = classifyDemand(demandRatioBps, dpcRow!.band_thresholds);
        demandBandBps = Number(dpcRow!.band_bps[band] ?? 0);

        const isSameDay = (startAt.getTime() - Date.now()) / 3600_000 < (dpcRow!.same_day_hours ?? 24);
        const isUrgent = (startAt.getTime() - Date.now()) / 3600_000 < (dpcRow!.urgent_hours ?? 6);
        const dow = startAt.getUTCDay();
        const isWeekend = dow === 0 || dow === 6;
        // Holidays: best-effort lookup.
        const { data: hol } = await admin
          .from("country_holidays").select("id")
          .eq("country_code", b.country_code.toUpperCase())
          .eq("holiday_date", startAt.toISOString().slice(0, 10)).maybeSingle();
        const isHoliday = !!hol;

        adj = computeAdjustment({
          demand_band_bps: demandBandBps,
          weekend_bps: dpcRow!.surcharge_weekend_bps,
          holiday_bps: dpcRow!.surcharge_holiday_bps,
          same_day_bps: dpcRow!.surcharge_same_day_bps,
          urgent_bps: dpcRow!.surcharge_urgent_bps,
          is_weekend: isWeekend, is_holiday: isHoliday,
          is_same_day: isSameDay, is_urgent: isUrgent,
          max_total_adjustment_bps: dpcRow!.max_total_adjustment_bps,
          allow_decrease: allowDecrease, allow_increase: allowIncrease,
          max_decrease_bps: pps!.max_decrease_bps, max_increase_bps: pps!.max_increase_bps,
        });
      }
    }

    const adjustedRateMinor = roundHalfAway(baseRateMinor * (10000 + adj.total_adjustment_bps) / 10000);
    const clampedRateMinor = clampRate(adjustedRateMinor, providerMin, providerMax, countryMinRateMinor);
    const hoursBilled = b.duration_minutes / 60;
    const subtotalMinor = roundHalfAway(clampedRateMinor * hoursBilled);

    const comm = applyCommission(subtotalMinor, commissionBps);
    const split = splitCommissionBps(commissionBps);

    const dynamicApplied = mode === "dynamic" && adj.total_adjustment_bps !== 0;

    const locFp = await locationFingerprint({ placeId: b.address_place_id ?? null, lat: b.lat ?? null, lng: b.lng ?? null });
    const ctxKey = await quoteContextKey({
      customerUserId: b.quote_context === "customer_checkout" ? requesterId : "-",
      providerIdText: b.provider_id_text,
      countryCode: b.country_code,
      serviceCategory: b.service_category,
      currency: b.currency,
      startAtIso: b.start_at,
      durationMinutes: b.duration_minutes,
      locationFingerprint: locFp,
    });

    const expiresAt = new Date(Date.now() + QUOTE_TTL_MIN * 60_000).toISOString();

    // Supersede existing active customer_checkout quote for the same key.
    if (b.quote_context === "customer_checkout") {
      await admin.from("pricing_calculations")
        .update({ status: "superseded" })
        .eq("quote_context_key", ctxKey)
        .eq("status", "quoted")
        .eq("quote_context", "customer_checkout");
    }

    const row = {
      quote_context: b.quote_context,
      status: failReason ? "void" : "quoted",
      pricing_mode: mode,
      dynamic_pricing_applied: dynamicApplied,
      requester_user_id: requesterId,
      customer_user_id: b.quote_context === "customer_checkout" ? requesterId : null,
      provider_user_id: b.provider_user_id,
      provider_id_text: b.provider_id_text,
      country_code: b.country_code.toUpperCase(),
      service_category: b.service_category,
      currency: b.currency.toUpperCase(),
      start_at: b.start_at,
      duration_minutes: b.duration_minutes,
      location_fingerprint: locFp,
      quote_context_key: ctxKey,
      provider_pricing_settings_id: pps?.id ?? null,
      dynamic_pricing_config_id: dpcRow?.id ?? null,
      provider_settings_version: pps?.version ?? null,
      config_version: dpcRow?.version ?? null,
      base_rate_minor: baseRateMinor,
      provider_min_rate_minor: providerMin,
      provider_max_rate_minor: providerMax,
      allow_decrease: allowDecrease,
      allow_increase: allowIncrease,
      supply_count: supply,
      demand_count: demand,
      demand_ratio_bps: demandRatioBps,
      demand_band: band,
      demand_band_bps: demandBandBps,
      weekend_bps: adj.weekend_bps,
      holiday_bps: adj.holiday_bps,
      same_day_bps: adj.same_day_bps,
      urgent_bps: adj.urgent_bps,
      total_adjustment_bps: adj.total_adjustment_bps,
      adjusted_rate_minor: adjustedRateMinor,
      clamped_rate_minor: clampedRateMinor,
      hours_billed: hoursBilled,
      subtotal_minor: subtotalMinor,
      commission_bps: commissionBps,
      customer_half_bps: split.customerHalfBps,
      provider_half_bps: split.providerHalfBps,
      customer_total_minor: comm.customerTotalMinor,
      provider_net_minor: comm.providerNetMinor,
      platform_fee_minor: comm.platformFeeMinor,
      expires_at: expiresAt,
      fail_reason: failReason,
    };

    const { data: inserted, error: insErr } = await admin
      .from("pricing_calculations").insert(row).select("*").single();
    if (insErr) return json(500, { error: "quote_insert_failed", detail: insErr.message });

    // CustomerDTO — never leak internal breakdown.
    return json(200, {
      quote_id: inserted.id,
      expires_at: inserted.expires_at,
      currency: inserted.currency,
      subtotal_minor: inserted.subtotal_minor,
      platform_fee_minor: inserted.platform_fee_minor,
      customer_total_minor: inserted.customer_total_minor,
      hours_billed: Number(inserted.hours_billed),
      pricing_mode: inserted.pricing_mode,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
