// Creates (or reuses) a Stripe Connect Express account for the calling provider
// and returns an onboarding URL.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE = "https://api.stripe.com/v1";

function form(o: Record<string, any>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) out.push(form(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}
async function stripe(path: string, body: Record<string, any>, key: string) {
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || "Stripe error");
  return j;
}

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
    const email = (claims.claims as any).email as string | undefined;

    const { return_url } = await req.json();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: profile } = await admin
      .from("profiles").select("stripe_account_id, country_code, provider_id")
      .eq("id", userId).maybeSingle();
    if (!profile?.provider_id) throw new Error("Du skal være registreret som provider");

    let acctId = profile.stripe_account_id;
    if (!acctId) {
      const acct = await stripe("/accounts", {
        type: "express",
        country: profile.country_code || "DK",
        email,
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "business_type": "individual",
      }, stripeKey);
      acctId = acct.id;
      await admin.from("profiles").update({ stripe_account_id: acctId }).eq("id", userId);
    }

    const link = await stripe("/account_links", {
      account: acctId,
      refresh_url: return_url,
      return_url,
      type: "account_onboarding",
    }, stripeKey);

    return new Response(JSON.stringify({ url: link.url, account_id: acctId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
