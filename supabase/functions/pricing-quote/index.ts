// pricing-quote — P0.1 authoritative pricing.
//
// This is the ONLY source of truth for booking money values. The client
// sends inputs; the server calculates and stores an immutable price quote.
// `payment-create-intent` will only accept a valid, unexpired quote_id
// produced by this function and read all financial values from the stored
// row (via `lock_pricing_quote`).
//
// Static mode always available for signed-in customers. Dynamic-pricing
// adjustments still require the `dynamic_pricing.enabled` feature flag.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import {
  applyCommission, classifyDemand, clampRate, computeAdjustment,
  locationFingerprint, quoteContextKey, roundHalfAway, splitCommissionBps,
} from "../_shared/pricing.ts";

const BodySchema = z.object({
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

const QUOTE_TTL_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const requesterId = claims?.claims?.sub as string | undefined;
    if (!requesterId) return json(401, { error: "Unauthorized" });

    const admin = createClient(url, svc, { auth: { persistSession: false } });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten().fieldErrors });
    const b = parsed.data;

    // Resolve provider: DB is source of truth. Accept either uuid or slug/text id.
    let providerUserId = b.provider_user_id ?? null;
    const { data: prof } = await admin
      .from("provider_profiles")
      .select("user_id, hourly_rate, service_categories, country_code, status, visibility, provider_slug")
      .or(
        providerUserId
          ? `user_id.eq.${providerUserId}`
          : `provider_slug.eq.${b.provider_id_text}`,
      )
      .maybeSingle();
    if (!prof) return json(400, { error: "provider_not_found" });
    providerUserId = prof.user_id;

    if (prof.status !== "active" || prof.visibility !== "public") {
      return json(400, { error: "provider_not_bookable" });
    }
    if (!prof.service_categories?.includes(b.service_category)) {
      return json(400, { error: "provider_service_unavailable" });
    }

    // Country config is derived from the provider's marketplace, not the client.
    const providerCountry = String(prof.country_code || "").toUpperCase();
    if (!providerCountry) return json(400, { error: "provider_country_missing" });
    const { data: cfgRows, error: cfgErr } = await admin
      .rpc("get_published_country_config", { _iso: providerCountry });
    if (cfgErr) return json(500, { error: "country_config_read_failed" });
    const cc = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
    if (!cc) return json(400, { error: "country_not_launched" });
    if (String(cc.currency).toUpperCase() !== b.currency.toUpperCase()) {
      return json(400, { error: "currency_country_mismatch" });
    }
    const commissionBps: number = cc.commission_bps;
    const countryMinRateMinor: number =
      Number((cc.config as Record<string, unknown> | null)?.["min_hourly_rate_minor"] ?? 0) || 0;

    // Provider dynamic settings (optional).
    const { data: pps } = await admin
      .from("provider_pricing_settings").select("*")
      .eq("provider_user_id", providerUserId)
      .eq("country_code", providerCountry)
      .eq("service_category", b.service_category)
      .maybeSingle();

    // Feature-flag gate applies to *dynamic* adjustments only. Static
    // quotes must always work at checkout to keep money server-authoritative.
    const { data: flag } = await admin
      .from("feature_flags").select("enabled")
      .eq("flag_key", "dynamic_pricing.enabled").maybeSingle();
    const dynamicFlagOn = !!flag?.enabled;

    const dynamicEligible = dynamicFlagOn && !!(pps && pps.enabled);
    const baseRateMinor = dynamicEligible ? pps!.base_rate_minor : (prof.hourly_rate ?? 0);
    const providerMin = dynamicEligible ? pps!.min_rate_minor : baseRateMinor;
    const providerMax = dynamicEligible ? pps!.max_rate_minor : baseRateMinor;
    const allowDecrease = dynamicEligible ? pps!.allow_decrease : false;
    const allowIncrease = dynamicEligible ? pps!.allow_increase : false;

    if (baseRateMinor <= 0) return json(400, { error: "provider_rate_unavailable" });

    // Dynamic config resolver (deterministic) — only consulted in dynamic mode.
    let dpcRow: any = null;
    if (dynamicEligible) {
      const { data: dpc } = await admin
        .rpc("resolve_dynamic_pricing_config", { _country: providerCountry, _category: b.service_category });
      dpcRow = Array.isArray(dpc) ? dpc[0] : dpc;
    }
    const dpcEnabled = !!(dpcRow && dpcRow.enabled);

    // Demand: real bookings only.
    const startAt = new Date(b.start_at);
    let demandCount = 0;
    let supplyCount = 0;
    if (dynamicEligible && dpcEnabled) {
      const winStart = new Date(startAt.getTime() - 2 * 3600_000).toISOString();
      const winEnd = new Date(startAt.getTime() + 2 * 3600_000).toISOString();
      const { count: dc } = await admin
        .from("bookings").select("id", { count: "exact", head: true })
        .eq("country_code", providerCountry)
        .eq("service", b.service_category)
        .in("status", ["pending", "confirmed"])
        .in("payment_status", ["authorized", "captured", "requires_action"])
        .gte("booking_date", winStart.slice(0, 10))
        .lte("booking_date", winEnd.slice(0, 10));
      demandCount = dc ?? 0;
      const { count: sc } = await admin
        .from("provider_profiles").select("user_id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("country_code", providerCountry)
        .contains("service_categories", [b.service_category]);
      supplyCount = sc ?? 0;
    }

    const supply = Math.max(supplyCount, 0);
    const demand = Math.max(demandCount, 0);
    const demandRatioBps = supply > 0 ? Math.round((demand * 10000) / supply) : 0;

    let mode: "static" | "dynamic" = "static";
    let band: "very_low" | "low" | "normal" | "high" | "very_high" = "normal";
    let demandBandBps = 0;
    let adj = { weekend_bps: 0, holiday_bps: 0, same_day_bps: 0, urgent_bps: 0, total_adjustment_bps: 0 };
    let failReason: string | null = null;

    if (dynamicEligible && dpcEnabled && supply >= (dpcRow!.min_supply_for_dynamic ?? 0)) {
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
        const { data: hol } = await admin
          .from("country_holidays").select("id")
          .eq("country_code", providerCountry)
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

    const locFp = await locationFingerprint({
      placeId: b.address_place_id ?? null, lat: b.lat ?? null, lng: b.lng ?? null,
    });
    const ctxKey = await quoteContextKey({
      customerUserId: b.quote_context === "customer_checkout" ? requesterId : "-",
      providerIdText: b.provider_id_text,
      countryCode: providerCountry,
      serviceCategory: b.service_category,
      currency: b.currency,
      startAtIso: b.start_at,
      durationMinutes: b.duration_minutes,
      locationFingerprint: locFp,
    });

    const expiresAt = new Date(Date.now() + QUOTE_TTL_MIN * 60_000).toISOString();

    // Supersede any active same-key checkout quote (single active per key).
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
      provider_user_id: providerUserId,
      provider_id_text: b.provider_id_text,
      country_code: providerCountry,
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

    if (failReason) return json(400, { error: failReason });

    return json(200, {
      quote_id: inserted.id,
      expires_at: inserted.expires_at,
      currency: inserted.currency,
      country_code: inserted.country_code,
      service_category: inserted.service_category,
      provider_user_id: inserted.provider_user_id,
      provider_id_text: inserted.provider_id_text,
      duration_minutes: inserted.duration_minutes,
      hours_billed: Number(inserted.hours_billed),
      subtotal_minor: inserted.subtotal_minor,
      platform_fee_minor: inserted.platform_fee_minor,
      customer_total_minor: inserted.customer_total_minor,
      provider_net_minor: inserted.provider_net_minor,
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
