// Verifies a Cloudflare Turnstile token server-side.
// The client calls this BEFORE supabase.auth.signUp / signInWithPassword /
// resetPasswordForEmail. If verification fails we refuse and the client
// never proceeds to the auth call.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token, action } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") {
      return json({ success: false, error: "missing_token" }, 400);
    }
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secret) return json({ success: false, error: "server_misconfigured" }, 500);

    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) form.append("remoteip", ip);

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await resp.json();

    if (!data.success) {
      return json({ success: false, error: "captcha_failed", codes: data["error-codes"] ?? [] }, 400);
    }
    if (action && data.action && data.action !== action) {
      return json({ success: false, error: "action_mismatch" }, 400);
    }
    return json({ success: true });
  } catch (err) {
    return json({ success: false, error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
