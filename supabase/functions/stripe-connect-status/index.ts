// Refreshes the calling provider's Stripe Connect status into profiles.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) throw new Error("Unauthorized");
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: profile } = await admin
      .from("profiles").select("stripe_account_id").eq("id", userId).maybeSingle();

    if (!profile?.stripe_account_id) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`https://api.stripe.com/v1/accounts/${profile.stripe_account_id}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const acct = await res.json();
    if (!res.ok) throw new Error(acct.error?.message || "Stripe error");

    await admin.from("profiles").update({
      stripe_onboarded: !!acct.details_submitted,
      stripe_charges_enabled: !!acct.charges_enabled,
      stripe_payouts_enabled: !!acct.payouts_enabled,
    }).eq("id", userId);

    return new Response(JSON.stringify({
      connected: true,
      account_id: acct.id,
      details_submitted: acct.charges_enabled,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
