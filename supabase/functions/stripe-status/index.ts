import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticate, requireRole } from "../_shared/auth.ts";



type KeyInfo = {
  configured: boolean;
  valid?: boolean;
  mode?: "test" | "live" | "unknown";
  error?: string;
};

async function checkSecret(key: string): Promise<KeyInfo & { account?: any }> {
  const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "unknown";
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (!res.ok) return { configured: true, mode, valid: false, error: data?.error?.message ?? "Stripe error" };
    return {
      configured: true, valid: true, mode,
      account: {
        id: data.id, email: data.email, country: data.country,
        business_profile: data.business_profile,
        charges_enabled: data.charges_enabled,
        payouts_enabled: data.payouts_enabled,
        details_submitted: data.details_submitted,
        default_currency: data.default_currency,
      },
    };
  } catch (e) {
    return { configured: true, mode, valid: false, error: String(e) };
  }
}

async function checkPublishable(key: string): Promise<KeyInfo> {
  const mode = key.startsWith("pk_live_") ? "live" : key.startsWith("pk_test_") ? "test" : "unknown";
  if (mode === "unknown") {
    return { configured: true, mode, valid: false, error: "Ugyldigt nøgleformat (skal starte med pk_test_ eller pk_live_)" };
  }
  // Validate by calling Stripe's tokens endpoint with the publishable key.
  // Publishable keys can authenticate this endpoint; missing card params returns
  // a 400 with parameter error (proves the key is valid), while an invalid key
  // returns 401 with "Invalid API Key provided".
  try {
    const res = await fetch("https://api.stripe.com/v1/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });
    const data = await res.json();
    if (res.status === 401) {
      return { configured: true, mode, valid: false, error: data?.error?.message ?? "Ugyldig publishable key" };
    }
    // Any non-401 response means the key authenticated successfully.
    return { configured: true, mode, valid: true };
  } catch (e) {
    return { configured: true, mode, valid: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Admin-only diagnostic — never expose Stripe account details to other users.
  const ctx = await authenticate(req, corsHeaders);
  if (ctx instanceof Response) return ctx;
  const forbidden = requireRole(ctx, ["admin"], corsHeaders);
  if (forbidden) return forbidden;



  const sk = Deno.env.get("STRIPE_SECRET_KEY");
  const pk = Deno.env.get("STRIPE_PUBLISHABLE_KEY");

  const secret: KeyInfo & { account?: any } = sk
    ? await checkSecret(sk)
    : { configured: false, error: "STRIPE_SECRET_KEY not set" };

  const publishable: KeyInfo = pk
    ? await checkPublishable(pk)
    : { configured: false, error: "STRIPE_PUBLISHABLE_KEY not set" };

  const modesMatch =
    secret.configured && publishable.configured &&
    secret.mode !== "unknown" && publishable.mode !== "unknown"
      ? secret.mode === publishable.mode
      : null;

  // Back-compat: keep top-level fields mirroring the secret key check.
  const payload = {
    configured: secret.configured,
    valid: secret.valid,
    mode: secret.mode,
    error: secret.error,
    account: secret.account,
    secret,
    publishable,
    modes_match: modesMatch,
  };

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
