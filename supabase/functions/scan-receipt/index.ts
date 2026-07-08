import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) return json({ error: "AI not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userRes, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const receiptId = String(body?.receipt_id ?? "");
    if (!receiptId) return json({ error: "Missing receipt_id" }, 400);

    const { data: rec, error: recErr } = await supabase
      .from("provider_receipts")
      .select("id, user_id, file_path, mime")
      .eq("id", receiptId)
      .maybeSingle();
    if (recErr || !rec) return json({ error: "Bilag ikke fundet" }, 404);
    if (rec.user_id !== userId) return json({ error: "Forbidden" }, 403);

    await supabase.from("provider_receipts").update({ scan_status: "scanning" }).eq("id", rec.id);

    // Download file
    const { data: file, error: dlErr } = await supabase.storage.from("receipts").download(rec.file_path);
    if (dlErr || !file) {
      await supabase.from("provider_receipts").update({ scan_status: "failed" }).eq("id", rec.id);
      return json({ error: "Kunne ikke hente fil" }, 500);
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = rec.mime || file.type || "image/jpeg";
    const base64 = base64Encode(buf);
    const dataUrl = `data:${mime};base64,${base64}`;

    const isPdf = mime.includes("pdf");
    const contentBlock = isPdf
      ? { type: "file", file: { filename: "receipt.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

    const prompt = `Extract from this Danish/European receipt. Reply ONLY with strict JSON, no prose:
{
 "vendor": string|null,
 "receipt_date": string|null (YYYY-MM-DD),
 "amount_cents": integer|null (total incl. VAT, in cents/øre),
 "vat_cents": integer|null (VAT/moms amount in cents/øre),
 "currency": string|null (ISO like DKK, EUR)
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: [{ type: "text", text: prompt }, contentBlock] },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      await supabase.from("provider_receipts").update({ scan_status: "failed" }).eq("id", rec.id);
      if (aiRes.status === 429) return json({ error: "AI-rate-limit — prøv igen om lidt" }, 429);
      if (aiRes.status === 402) return json({ error: "AI-kredit opbrugt" }, 402);
      return json({ error: "AI-scanning fejlede" }, 500);
    }
    const aiJson = await aiRes.json();
    const text: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed: any = {};
    try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }

    const receipt_date: string | null = parsed.receipt_date || null;
    const d = receipt_date ? new Date(receipt_date) : new Date();
    const year = d.getFullYear();
    const quarter = Math.floor(d.getMonth() / 3) + 1;

    const patch = {
      vendor: parsed.vendor ?? null,
      receipt_date,
      amount_cents: Number.isFinite(parsed.amount_cents) ? parsed.amount_cents : null,
      vat_cents: Number.isFinite(parsed.vat_cents) ? parsed.vat_cents : null,
      currency: parsed.currency || "DKK",
      quarter,
      year,
      raw_ocr: parsed,
      scan_status: "scanned",
    };
    const { error: upErr } = await supabase.from("provider_receipts").update(patch).eq("id", rec.id);
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, ...patch });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
