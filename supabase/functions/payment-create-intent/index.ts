// payment-create-intent — P0.1 authoritative checkout.
//
// The client sends ONLY booking inputs plus a `quote_id` produced by
// `pricing-quote`. All financial values (customer_pays, provider_gets,
// platform_fee, currency, country) are read from the locked pricing quote
// via `lock_pricing_quote`. Client-supplied money fields are ignored.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { monitored } from "../_shared/logger.ts";

const STRIPE = "https://api.stripe.com/v1";

const BodySchema = z.object({
  quote_id: z.string().uuid(),
  booking_date: z.string().min(4),          // YYYY-MM-DD
  slot: z.string().min(1),                  // e.g. "09:00"
  address: z.string().min(1),
  address_place_id: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  provider_name: z.string().nullable().optional(),  // display-only
  payment_method_type: z.string().optional(),
});

function form(obj: Record<string, any>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) out.push(form(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

async function stripe(path: string, body: Record<string, any>, key: string, idem?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(`${STRIPE}${path}`, { method: "POST", headers, body: form(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Stripe error");
  return json;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(monitored("payment-create-intent", async (req, _log) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimErr } = await supaUser.auth.getClaims(token);
    if (claimErr || !claims?.claims) return json(401, { error: "Unauthorized" });
    const userId = claims.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten().fieldErrors });
    const b = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ---- 1. Load + validate quote (server-authoritative money) -----------
    const { data: quote, error: qErr } = await admin
      .from("pricing_calculations")
      .select("*")
      .eq("id", b.quote_id)
      .maybeSingle();
    if (qErr || !quote) return json(400, { error: "quote_not_found" });
    if (quote.quote_context !== "customer_checkout")
      return json(400, { error: "quote_context_invalid" });
    if (quote.customer_user_id !== userId)
      return json(403, { error: "quote_not_owned" });
    if (quote.status === "locked") {
      // Idempotent: return the existing booking + PI for this quote.
      const { data: existing } = await admin
        .from("bookings")
        .select("id, payment_intent_id")
        .eq("pricing_calculation_id", quote.id)
        .maybeSingle();
      if (existing?.payment_intent_id) {
        const pi = await fetch(`${STRIPE}/payment_intents/${existing.payment_intent_id}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        }).then((r) => r.json());
        return json(200, {
          booking_id: existing.id,
          payment_intent_id: existing.payment_intent_id,
          client_secret: pi.client_secret,
          idempotent: true,
        });
      }
      return json(409, { error: "quote_already_locked" });
    }
    if (quote.status !== "quoted") return json(400, { error: `quote_not_quotable:${quote.status}` });
    if (new Date(quote.expires_at).getTime() <= Date.now())
      return json(400, { error: "quote_expired" });

    // ---- 2. Cross-check booking inputs against quote ---------------------
    const country = String(quote.country_code).toUpperCase();
    const currency = String(quote.currency).toUpperCase();
    const hours = Number(quote.duration_minutes) / 60;
    const customerPays = Number(quote.customer_total_minor);
    const providerGets = Number(quote.provider_net_minor);
    const platformFee = Number(quote.platform_fee_minor);
    if (customerPays < 50) return json(400, { error: "amount_too_small" });

    // ---- 3. Country config lineage (frozen on booking) -------------------
    const { data: cfgRows, error: cfgErr } = await admin
      .rpc("get_published_country_config", { _iso: country });
    if (cfgErr) return json(500, { error: `country_config_read_failed:${cfgErr.message}` });
    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
    if (!cfg) return json(400, { error: `country_not_launched:${country}` });
    if (!cfg.active) return json(400, { error: `country_inactive:${country}` });
    if (!["launch_ready", "active"].includes(cfg.launch_status))
      return json(400, { error: `country_not_launch_ready:${country}` });
    if (String(cfg.currency).toUpperCase() !== currency)
      return json(400, { error: "currency_country_mismatch" });

    const cfgJson = (cfg.config ?? {}) as Record<string, unknown>;
    const allowedMethods = ((cfgJson as any)?.payment_methods_public ?? []) as string[];
    if (b.payment_method_type && allowedMethods.length &&
        !allowedMethods.includes(b.payment_method_type)) {
      return json(400, { error: `payment_method_not_permitted:${b.payment_method_type}` });
    }

    // ---- 4. Provider Stripe Connect lookup -------------------------------
    const { data: provProfile } = await admin
      .from("profiles")
      .select("id, stripe_account_id, stripe_charges_enabled, country_code")
      .eq("provider_id", quote.provider_id_text)
      .maybeSingle();
    const providerAcct = provProfile?.stripe_charges_enabled ? provProfile.stripe_account_id : null;
    const providerUserId = provProfile?.id ?? quote.provider_user_id ?? null;

    // ---- 5. Idempotent booking creation ----------------------------------
    // Race-safe: unique index on bookings.pricing_calculation_id.
    const taxSnapshot = {
      vat_rate_bps: cfg.vat_rate_bps, currency: cfg.currency,
      country_code: cfg.iso, config_version: cfg.config_version,
    };
    const commissionSnapshot = { commission_bps: cfg.commission_bps, config_version: cfg.config_version };
    const bookingRulesSnapshot = { rules: (cfgJson as any)?.booking_public ?? {}, config_version: cfg.config_version };

    let bookingId: string;
    const { data: booking, error: insErr } = await admin
      .from("bookings")
      .insert({
        customer_user_id: userId,
        provider_id: quote.provider_id_text,
        provider_name: b.provider_name ?? null,
        service: quote.service_category,
        hours,
        booking_date: b.booking_date,
        slot: b.slot,
        address: b.address,
        address_place_id: b.address_place_id ?? null,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        notes: b.notes ?? null,
        customer_pays: customerPays,
        provider_gets: providerGets,
        currency,
        status: "pending",
        payment_status: "unpaid",
        platform_fee_amount: platformFee,
        provider_stripe_account_id: providerAcct,
        country_code: cfg.iso,
        timezone: cfg.timezone,
        country_config_version: cfg.config_version,
        tax_config_snapshot: taxSnapshot,
        commission_config_snapshot: commissionSnapshot,
        booking_rules_snapshot: bookingRulesSnapshot,
        pricing_calculation_id: quote.id,
      })
      .select("id")
      .single();

    if (insErr) {
      // Duplicate on pricing_calculation_id → return the existing booking's PI.
      if ((insErr as any).code === "23505") {
        const { data: existing } = await admin
          .from("bookings").select("id, payment_intent_id")
          .eq("pricing_calculation_id", quote.id).maybeSingle();
        if (existing?.payment_intent_id) {
          const pi = await fetch(`${STRIPE}/payment_intents/${existing.payment_intent_id}`, {
            headers: { Authorization: `Bearer ${stripeKey}` },
          }).then((r) => r.json());
          return json(200, {
            booking_id: existing.id,
            payment_intent_id: existing.payment_intent_id,
            client_secret: pi.client_secret,
            idempotent: true,
          });
        }
      }
      return json(500, { error: `booking_insert_failed:${insErr.message}` });
    }
    bookingId = booking.id;

    // ---- 6. Lock the quote onto the booking (immutable snapshot) --------
    const { error: lockErr } = await admin.rpc("lock_pricing_quote", {
      _booking_id: bookingId, _quote_id: quote.id,
    });
    if (lockErr) {
      await admin.from("bookings").delete().eq("id", bookingId);
      return json(400, { error: `quote_lock_failed:${lockErr.message}` });
    }

    // ---- 7. Create Stripe PaymentIntent (idempotent per quote) ----------
    const txRef = `MC-${bookingId.slice(0, 8).toUpperCase()}`;
    const piBody: Record<string, any> = {
      amount: customerPays,
      currency: currency.toLowerCase(),
      capture_method: "manual",
      "automatic_payment_methods[enabled]": "true",
      "transfer_group": txRef,
      "statement_descriptor_suffix": txRef.slice(0, 22),
      "metadata[booking_id]": bookingId,
      "metadata[customer_user_id]": userId,
      "metadata[provider_id]": quote.provider_id_text,
      "metadata[quote_id]": quote.id,
      "metadata[transaction_reference]": txRef,
      "metadata[country_code]": cfg.iso,
      "metadata[country_config_version]": String(cfg.config_version ?? 0),
    };
    if (providerUserId) piBody["metadata[provider_user_id]"] = providerUserId;
    if (providerAcct) {
      piBody["application_fee_amount"] = platformFee;
      piBody["transfer_data[destination]"] = providerAcct;
      piBody["transfer_data[metadata][booking_id]"] = bookingId;
      piBody["transfer_data[metadata][quote_id]"] = quote.id;
      piBody["transfer_data[metadata][transaction_reference]"] = txRef;
      piBody["transfer_data[metadata][country_code]"] = cfg.iso;
      piBody["transfer_data[metadata][country_config_version]"] = String(cfg.config_version ?? 0);
      if (providerUserId) piBody["transfer_data[metadata][provider_user_id]"] = providerUserId;
      piBody["transfer_data[metadata][provider_id]"] = quote.provider_id_text;
    }

    // Stripe idempotency keyed off the quote — any retry hits the same PI.
    const idemKey = `pi:quote:${quote.id}`;
    let pi;
    try {
      pi = await stripe("/payment_intents", piBody, stripeKey, idemKey);
    } catch (e) {
      // Do NOT delete the booking here: quote is already locked, retries must
      // be safe. Surface the Stripe error; ops can inspect via booking_id.
      return json(502, { error: `stripe_pi_failed:${(e as Error).message}`, booking_id: bookingId });
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await admin.from("bookings").update({
      payment_intent_id: pi.id,
      authorization_expires_at: expires,
    }).eq("id", bookingId);

    return json(200, {
      booking_id: bookingId,
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
}));
