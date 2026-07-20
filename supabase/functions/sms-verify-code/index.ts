import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { monitored } from "../_shared/logger.ts";
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

Deno.serve(monitored("sms-verify-code", async (req, _log) => {
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
    const code = String(body?.code ?? "").trim();
    if (!phone || !/^\d{6}$/.test(code)) return json({ error: "Ugyldigt input" }, 400);

    const { data: row } = await supabase
      .from("sms_verifications")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("user_id", userId)
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return json({ error: "Ingen aktiv kode. Bed om en ny." }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "Koden er udløbet." }, 400);
    if (row.attempts >= 5) return json({ error: "For mange forkerte forsøg. Bed om en ny kode." }, 429);

    const expected = await sha256(`${phone}:${code}`);
    if (expected !== row.code_hash) {
      await supabase.from("sms_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "Forkert kode." }, 400);
    }

    const now = new Date().toISOString();
    await supabase.from("sms_verifications").update({ consumed_at: now }).eq("id", row.id);
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ sms_phone: phone, sms_verified_at: now })
      .eq("id", userId);
    if (profErr) return json({ error: profErr.message }, 500);

    // Trusted reconciliation: SMS is a completion signal for providers.
    try {
      const { reconcileProvider } = await import("../_shared/providerReconcile.ts");
      await reconcileProvider(supabase, userId, "sms_verified");
    } catch (e) { console.error("provider reconcile after sms failed", (e as Error).message); }


    return json({ ok: true, phone, verified_at: now });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}));

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
