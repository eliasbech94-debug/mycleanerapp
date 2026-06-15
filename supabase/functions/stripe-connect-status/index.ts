// Provider-scoped Stripe status. Returns the Stripe Connect status for the
// CALLING provider only — never another user's account. Requires the
// `provider` role (admins also pass via super_admin bypass in requireRole).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const forbidden = requireRole(ctx, ["provider"], corsHeaders);
    if (forbidden) return forbidden;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const { admin, user } = ctx;

    // Scope strictly to the caller's own profile row.
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);

    if (!profile?.stripe_account_id) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(
      `https://api.stripe.com/v1/accounts/${profile.stripe_account_id}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    const acct = await res.json();
    if (!res.ok) throw new Error(acct.error?.message || "Stripe error");

    await admin
      .from("profiles")
      .update({
        stripe_onboarded: !!acct.details_submitted,
        stripe_charges_enabled: !!acct.charges_enabled,
        stripe_payouts_enabled: !!acct.payouts_enabled,
      })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({
        connected: true,
        account_id: acct.id,
        mode: String(acct.id).startsWith("acct_") && stripeKey.startsWith("sk_live_")
          ? "live"
          : "test",
        details_submitted: !!acct.details_submitted,
        charges_enabled: !!acct.charges_enabled,
        payouts_enabled: !!acct.payouts_enabled,
        requirements: {
          currently_due: acct.requirements?.currently_due ?? [],
          past_due: acct.requirements?.past_due ?? [],
          disabled_reason: acct.requirements?.disabled_reason ?? null,
        },
        default_currency: acct.default_currency ?? null,
        country: acct.country ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
