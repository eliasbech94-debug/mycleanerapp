// Manage saved Stripe payment methods for the authenticated user.
// Actions: setup_intent | list | delete
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

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

async function stripe(path: string, method: "GET" | "POST" | "DELETE", key: string, body?: Record<string, any>) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (body && method !== "GET") init.body = form(body);
  const url = body && method === "GET" ? `${STRIPE}${path}?${form(body)}` : `${STRIPE}${path}`;
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Stripe error");
  return json;
}

Deno.serve(async (req) => {
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
    const email = (claims.claims.email as string) || undefined;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ensure Stripe customer exists for this user.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, full_name")
      .eq("id", userId)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | null;

    // Verify existing customer still exists in the current Stripe account
    // (handles test/live key swaps or account changes).
    if (customerId) {
      try {
        const existing = await stripe(`/customers/${customerId}`, "GET", stripeKey);
        if (existing?.deleted) customerId = null;
      } catch (_) {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe("/customers", "POST", stripeKey, {
        email,
        name: profile?.full_name || undefined,
        "metadata[user_id]": userId,
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    if (action === "setup_intent") {
      const si = await stripe("/setup_intents", "POST", stripeKey, {
        customer: customerId,
        "payment_method_types[]": "card",
        usage: "off_session",
      });
      return new Response(JSON.stringify({ client_secret: si.client_secret, customer_id: customerId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const [pms, customer] = await Promise.all([
        stripe("/payment_methods", "GET", stripeKey, { customer: customerId, type: "card" }),
        stripe(`/customers/${customerId}`, "GET", stripeKey),
      ]);
      const defaultPm = customer?.invoice_settings?.default_payment_method || null;
      const cards = (pms.data || []).map((pm: any) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year: pm.card?.exp_year,
        is_default: pm.id === defaultPm,
      }));
      return new Response(JSON.stringify({ cards, default_payment_method: defaultPm }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_default") {
      const pmId = body?.payment_method_id as string;
      if (!pmId) throw new Error("Missing payment_method_id");
      const pm = await stripe(`/payment_methods/${pmId}`, "GET", stripeKey);
      if (pm.customer !== customerId) throw new Error("Forbidden");
      await stripe(`/customers/${customerId}`, "POST", stripeKey, {
        "invoice_settings[default_payment_method]": pmId,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const pmId = body?.payment_method_id as string;
      if (!pmId) throw new Error("Missing payment_method_id");
      // Verify the PM belongs to this customer before detaching.
      const pm = await stripe(`/payment_methods/${pmId}`, "GET", stripeKey);
      if (pm.customer !== customerId) throw new Error("Forbidden");
      await stripe(`/payment_methods/${pmId}/detach`, "POST", stripeKey);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
