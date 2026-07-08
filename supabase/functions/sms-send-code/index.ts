import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalize(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const phone = normalize(String(body?.phone ?? ""));
    if (!phone) return json({ error: "Ugyldigt telefonnummer" }, 400);

    // Rate limit: max 3 codes per 10 min
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await supabase
      .from("sms_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) return json({ error: "For mange forsøg. Prøv igen om 10 minutter." }, 429);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(`${phone}:${code}`);
    const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error: insErr } = await supabase.from("sms_verifications").insert({
      user_id: userId,
      phone,
      code_hash,
      expires_at,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // TODO: integrer SMS-udbyder her. Indtil da logges koden.
    console.log(`[sms-send-code] user=${userId} phone=${phone} code=${code}`);

    return json({ ok: true, phone, dev_code: code });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
