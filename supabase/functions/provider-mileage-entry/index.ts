// Provider mileage entry write path.
//
// SECURITY CONTRACT: the client may send distances, dates, transport mode and
// notes only. `estimated_allowance_amount`, `currency` and any rate field in
// the payload are discarded and recomputed server-side from the versioned
// mileage_country_rules row that is valid for the travel date and country.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";
import {
  computeMileageAllowance,
  sanitizeMileageEntryInput,
  type MileageCountryRule,
  type TransportMode,
} from "../_shared/mileageAllowance.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const TRANSPORT_MODES: TransportMode[] = [
  "own_car",
  "own_motorcycle",
  "own_bicycle",
  "public_transport",
  "customer_vehicle",
  "walking",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const uid = ctx.user.id;

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Drop every client-controlled money field before anything else happens.
    const body = sanitizeMileageEntryInput(raw);

    const travelDate = String((body as Record<string, unknown>).travel_date ?? "");
    const countryCode = String((body as Record<string, unknown>).country_code ?? "").toUpperCase();
    const outbound = Number((body as Record<string, unknown>).outbound_distance_km ?? 0);
    const back = Number((body as Record<string, unknown>).return_distance_km ?? 0);
    const mode = String(
      (body as Record<string, unknown>).transport_mode ?? "own_car",
    ) as TransportMode;
    const requestedVersion =
      (body as Record<string, unknown>).country_rule_version != null
        ? String((body as Record<string, unknown>).country_rule_version)
        : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) return json({ error: "invalid_travel_date" }, 400);
    if (!/^[A-Z]{2}$/.test(countryCode)) return json({ error: "invalid_country_code" }, 400);
    if (!TRANSPORT_MODES.includes(mode)) return json({ error: "invalid_transport_mode" }, 400);
    if (!Number.isFinite(outbound) || !Number.isFinite(back) || outbound < 0 || back < 0) {
      return json({ error: "invalid_distance" }, 400);
    }

    const { data: rules, error: rulesErr } = await admin
      .from("mileage_country_rules")
      .select(
        "id, country_code, version, valid_from, valid_to, currency, rate_bands, allowed_transport_modes, status",
      )
      .eq("country_code", countryCode);
    if (rulesErr) return json({ error: rulesErr.message }, 500);

    const result = computeMileageAllowance({
      rules: (rules ?? []) as unknown as MileageCountryRule[],
      countryCode,
      travelDate,
      outboundDistanceKm: outbound,
      returnDistanceKm: back,
      transportMode: mode,
      requestedRuleVersion: requestedVersion,
    });

    if (result.status === "rejected") {
      return json({ error: result.code, reason: result.reason }, 422);
    }

    const { data, error } = await admin
      .from("provider_mileage_entries")
      .insert({
        user_id: uid,
        travel_date: travelDate,
        country_code: countryCode,
        outbound_distance_km: outbound,
        return_distance_km: back,
        transport_mode: mode,
        purpose: (body as Record<string, unknown>).purpose ?? null,
        booking_id: (body as Record<string, unknown>).booking_id ?? null,
        notes: (body as Record<string, unknown>).notes ?? null,
        // Server-derived only:
        estimated_allowance_amount: result.allowanceMinor,
        currency: result.currency,
        country_rule_id: result.ruleId,
        country_rule_version: result.ruleVersion,
        calculation_code: result.code,
      })
      .select()
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ entry: data, calculation: result });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
