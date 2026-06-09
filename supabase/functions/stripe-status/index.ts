import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    return new Response(
      JSON.stringify({ configured: false, error: "STRIPE_SECRET_KEY not set" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }

  const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "unknown";

  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(
        JSON.stringify({ configured: true, mode, valid: false, error: data?.error?.message ?? "Stripe error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        configured: true,
        valid: true,
        mode,
        account: {
          id: data.id,
          email: data.email,
          country: data.country,
          business_profile: data.business_profile,
          charges_enabled: data.charges_enabled,
          payouts_enabled: data.payouts_enabled,
          details_submitted: data.details_submitted,
          default_currency: data.default_currency,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ configured: true, mode, valid: false, error: String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
