// Called from client after successful card confirmation. Verifies with Stripe that
// the PaymentIntent is requires_capture, then flips booking.payment_status='authorized'.
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

    const { booking_id } = await req.json();
    if (!booking_id) throw new Error("booking_id required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: b } = await admin
      .from("bookings")
      .select("payment_intent_id, customer_user_id")
      .eq("id", booking_id)
      .maybeSingle();
    if (!b || b.customer_user_id !== claims.claims.sub) throw new Error("Not found");
    if (!b.payment_intent_id) throw new Error("No intent");

    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${b.payment_intent_id}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const pi = await res.json();
    if (!res.ok) throw new Error(pi.error?.message || "Stripe error");

    const map: Record<string, string> = {
      requires_capture: "authorized",
      succeeded: "captured",
      canceled: "canceled",
    };
    const status = map[pi.status] || "none";
    await admin.from("bookings").update({ payment_status: status }).eq("id", booking_id);

    return new Response(JSON.stringify({ payment_status: status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
