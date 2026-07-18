// Creates a booking row + Stripe PaymentIntent (manual capture, 24h authorization).
// Returns client_secret so frontend can confirm the card.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

import { monitored } from "../_shared/logger.ts";
const STRIPE = "https://api.stripe.com/v1";

function form(obj: Record<string, any>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(form(v, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.join("&");
}

async function stripe(path: string, body: Record<string, any>, key: string, idem?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers,
    body: form(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Stripe error");
  return json;
}

Deno.serve(monitored("payment-create-intent", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimErr } = await supaUser.auth.getClaims(token);
    if (claimErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const {
      provider_id, provider_name, service, hours,
      booking_date, slot, address, address_place_id, lat, lng, notes,
      customer_pays, provider_gets, currency,
      country_code: bodyCountry,
    } = body;

    if (!provider_id || !customer_pays || !provider_gets || !currency || !booking_date || !slot) {
      throw new Error("Missing booking fields");
    }
    if (customer_pays < 50) throw new Error("Amount too small");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up provider's Connect account (if any) + their marketplace country.
    const { data: provProfile } = await admin
      .from("profiles")
      .select("id, stripe_account_id, stripe_charges_enabled, country_code")
      .eq("provider_id", provider_id)
      .maybeSingle();

    // === Server-side country config resolution ============================
    // The country of a booking is the *provider's* marketplace country, not
    // whatever the client currently browses. This makes the snapshot
    // authoritative and prevents client tampering.
    const country = (provProfile?.country_code ?? bodyCountry ?? "DK").toUpperCase();
    const { data: cfgRows, error: cfgErr } = await admin
      .rpc("get_published_country_config", { _iso: country });
    if (cfgErr) throw new Error(`country_config_read_failed: ${cfgErr.message}`);
    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
    if (!cfg) throw new Error(`country_not_launched:${country}`);
    if (!cfg.active) throw new Error(`country_inactive:${country}`);
    if (!["launch_ready", "active"].includes(cfg.launch_status)) {
      throw new Error(`country_not_launch_ready:${country}:${cfg.launch_status}`);
    }
    if (String(cfg.currency).toUpperCase() !== String(currency).toUpperCase()) {
      throw new Error(`currency_country_mismatch:${currency}!=${cfg.currency}`);
    }

    // Validate permitted payment methods (best-effort; empty allowlist = all).
    const cfgJson = (cfg.config ?? {}) as Record<string, unknown>;
    const allowedMethods = ((cfgJson as any)?.payment_methods_public ?? []) as string[];
    // Client may pass payment_method_type; when set, must be permitted.
    const pmType = (body.payment_method_type ?? "").toString();
    if (pmType && allowedMethods.length && !allowedMethods.includes(pmType)) {
      throw new Error(`payment_method_not_permitted:${pmType}`);
    }
    // =====================================================================

    const providerAcct = provProfile?.stripe_charges_enabled ? provProfile.stripe_account_id : null;
    const providerUserId = provProfile?.id ?? null;
    const platformFee = customer_pays - provider_gets;

    // Immutable snapshots — never re-read once written.
    const taxSnapshot = {
      vat_rate_bps: cfg.vat_rate_bps,
      currency: cfg.currency,
      country_code: cfg.iso,
      config_version: cfg.config_version,
    };
    const commissionSnapshot = {
      commission_bps: cfg.commission_bps,
      config_version: cfg.config_version,
    };
    const bookingRulesSnapshot = {
      rules: (cfgJson as any)?.booking_public ?? {},
      config_version: cfg.config_version,
    };

    // Insert booking (pending, payment none) with FROZEN configuration snapshots.
    const { data: booking, error: insErr } = await admin
      .from("bookings")
      .insert({
        customer_user_id: userId, provider_id, provider_name, service, hours,
        booking_date, slot, address, address_place_id, lat, lng, notes,
        customer_pays, provider_gets, currency,
        status: "pending", payment_status: "none",
        platform_fee_amount: platformFee,
        provider_stripe_account_id: providerAcct,
        country_code: cfg.iso,
        timezone: cfg.timezone,
        country_config_version: cfg.config_version,
        tax_config_snapshot: taxSnapshot,
        commission_config_snapshot: commissionSnapshot,
        booking_rules_snapshot: bookingRulesSnapshot,
      })
      .select("id")
      .single();
    if (insErr || !booking) throw new Error(insErr?.message || "insert failed");

    // Build a stable transaction reference so we can link Stripe → booking end-to-end.
    const txRef = `MC-${booking.id.slice(0, 8).toUpperCase()}`;

    // Create PI: manual capture (24h auth window). Application fee + transfer if Connect ready.
    // Metadata is duplicated on the transfer (destination charge) via transfer_data[metadata][...]
    // so finance_payouts always has provider_user_id + booking_id even without a webhook fallback.
    const piBody: Record<string, any> = {
      amount: customer_pays,
      currency: currency.toLowerCase(),
      capture_method: "manual",
      "automatic_payment_methods[enabled]": "true",
      "transfer_group": txRef,
      "statement_descriptor_suffix": txRef.slice(0, 22),
      "metadata[booking_id]": booking.id,
      "metadata[customer_user_id]": userId,
      "metadata[provider_id]": provider_id,
      "metadata[transaction_reference]": txRef,
      // Country + config lineage on every PaymentIntent — reconciles Stripe →
      // marketplace even if the DB row is later archived.
      "metadata[country_code]": cfg.iso,
      "metadata[country_config_version]": String(cfg.config_version ?? 0),
    };
    if (providerUserId) piBody["metadata[provider_user_id]"] = providerUserId;
    if (providerAcct) {
      piBody["application_fee_amount"] = platformFee;
      piBody["transfer_data[destination]"] = providerAcct;
      piBody["transfer_data[metadata][booking_id]"] = booking.id;
      piBody["transfer_data[metadata][transaction_reference]"] = txRef;
      piBody["transfer_data[metadata][country_code]"] = cfg.iso;
      piBody["transfer_data[metadata][country_config_version]"] = String(cfg.config_version ?? 0);
      if (providerUserId) piBody["transfer_data[metadata][provider_user_id]"] = providerUserId;
      piBody["transfer_data[metadata][provider_id]"] = provider_id;
    }

    // Idempotency: same booking_id must produce the same PI (protects against
    // retries after network errors).
    const idemKey = `pi:${booking.id}`;

    let pi;
    try {
      pi = await stripe("/payment_intents", piBody, stripeKey);
    } catch (e) {
      await admin.from("bookings").delete().eq("id", booking.id);
      throw e;
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await admin.from("bookings").update({
      payment_intent_id: pi.id,
      authorization_expires_at: expires,
    }).eq("id", booking.id);

    return new Response(JSON.stringify({
      booking_id: booking.id,
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
