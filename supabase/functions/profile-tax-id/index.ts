// Encrypted CPR/CVR for a user's own profile. GET returns masked/plaintext to
// the owner only; POST encrypts server-side; DELETE clears it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

const KEY = Deno.env.get("TAX_ENCRYPTION_KEY")!;
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const last4 = (s?: string | null) =>
  s && s.length > 0 ? s.replace(/\s+/g, "").slice(-4) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!KEY) return json({ error: "server_misconfigured" }, 500);
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;
    const uid = ctx.user.id;

    if (req.method === "GET") {
      const { data, error } = await admin.from("profiles")
        .select("tax_id_enc, tax_id_last4, tax_municipality, tax_type, encryption_version")
        .eq("id", uid).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      let tax_id: string | null = null;
      if (data?.tax_id_enc) {
        const { data: dec, error: dErr } = await admin.rpc("tax_decrypt", {
          _ciphertext: data.tax_id_enc, _key: KEY,
        });
        if (dErr) return json({ error: "decrypt_failed" }, 500);
        tax_id = (dec as string | null) ?? null;
      }
      return json({
        tax_id, // owner-only response
        tax_id_last4: data?.tax_id_last4 ?? null,
        tax_municipality: data?.tax_municipality ?? null,
        tax_type: data?.tax_type ?? null,
        has_tax_id: !!data?.tax_id_enc,
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.json().catch(() => ({} as any));
      const municipality = body.tax_municipality ? String(body.tax_municipality) : null;
      const type = body.tax_type === "business" ? "business" : "private";
      const plaintext = body.tax_id ? String(body.tax_id).trim() : null;

      const patch: Record<string, unknown> = {
        tax_municipality: municipality, tax_type: type,
      };
      if (plaintext) {
        const { data: enc, error: eErr } = await admin.rpc("tax_encrypt", {
          _plaintext: plaintext, _key: KEY,
        });
        if (eErr) return json({ error: "encrypt_failed" }, 500);
        patch.tax_id_enc = enc;
        patch.tax_id_last4 = last4(plaintext);
        patch.encryption_version = 1;
        patch.tax_id_encrypted = null; // clear legacy base64 field
      }
      const { error } = await admin.from("profiles").update(patch).eq("id", uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { error } = await admin.from("profiles").update({
        tax_id_enc: null, tax_id_last4: null, tax_id_encrypted: null,
        tax_municipality: null, tax_type: null,
      }).eq("id", uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
