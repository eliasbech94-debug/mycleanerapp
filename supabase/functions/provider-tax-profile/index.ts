// Provider tax profile: encrypt/decrypt sensitive fields (VAT number, business
// name/address, tax_id/CVR) with pgcrypto AES-256. The encryption key comes
// from Lovable Cloud secret TAX_ENCRYPTION_KEY and never touches the client.
//
// GET  → returns provider's own profile with plaintext + last4 (owner) or
//        masked-only (admin/employee)
// POST → upsert; server encrypts before writing
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

async function encrypt(v?: string | null): Promise<Uint8Array | null> {
  if (!v) return null;
  const { data, error } = await admin.rpc("tax_encrypt", { _plaintext: v, _key: KEY });
  if (error) throw new Error("encrypt_failed: " + error.message);
  return data as unknown as Uint8Array;
}
async function decrypt(v: unknown): Promise<string | null> {
  if (!v) return null;
  const { data, error } = await admin.rpc("tax_decrypt", { _ciphertext: v, _key: KEY });
  if (error) throw new Error("decrypt_failed: " + error.message);
  return (data as string | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!KEY) return json({ error: "server_misconfigured" }, 500);
    const ctx = await authenticate(req, corsHeaders);
    if (ctx instanceof Response) return ctx;

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("provider_user_id") ?? ctx.user.id;
    const isPrivileged = ctx.isSuperAdmin || ctx.roles.includes("admin") || ctx.roles.includes("employee");
    const isOwner = targetUserId === ctx.user.id;
    if (!isOwner && !isPrivileged) return json({ error: "forbidden" }, 403);

    if (req.method === "GET") {
      const { data, error } = await admin.from("provider_tax_profiles")
        .select("*").eq("provider_user_id", targetUserId).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ profile: null });

      // Owner sees plaintext; admin/employee sees masked only.
      const showPlain = isOwner;
      const [vat_number, business_name, business_address, tax_id] = showPlain
        ? await Promise.all([
            decrypt(data.vat_number_enc),
            decrypt(data.business_name_enc),
            decrypt(data.business_address_enc),
            decrypt(data.tax_id_enc),
          ])
        : [null, null, null, null];

      return json({
        profile: {
          country_code: data.country_code,
          provider_type: data.provider_type,
          vat_registered: data.vat_registered,
          vat_number, business_name, business_address, tax_id,
          vat_number_last4: data.vat_number_last4,
          tax_id_last4: data.tax_id_last4,
          encryption_version: data.encryption_version,
        },
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      if (!isOwner) return json({ error: "forbidden" }, 403);
      const body = await req.json().catch(() => ({} as any));
      const country_code = String(body.country_code ?? "DK").toUpperCase();
      const provider_type = body.provider_type === "business" ? "business" : "private";
      const vat_registered = !!body.vat_registered;
      const vat_number = body.vat_number ? String(body.vat_number).trim() : null;
      const business_name = body.business_name ? String(body.business_name).trim() : null;
      const business_address = body.business_address ? String(body.business_address).trim() : null;
      const tax_id = body.tax_id ? String(body.tax_id).trim() : null;

      const [vat_enc, name_enc, addr_enc, tid_enc] = await Promise.all([
        encrypt(vat_number), encrypt(business_name), encrypt(business_address), encrypt(tax_id),
      ]);

      const row = {
        provider_user_id: targetUserId,
        country_code, provider_type, vat_registered,
        vat_number_enc: vat_enc,
        business_name_enc: name_enc,
        business_address_enc: addr_enc,
        tax_id_enc: tid_enc,
        vat_number_last4: last4(vat_number),
        tax_id_last4: last4(tax_id),
        encryption_version: 1,
        // Ensure legacy plaintext columns stay NULL
        vat_number: null, business_name: null, business_address: null, tax_id: null,
      };
      const { error } = await admin.from("provider_tax_profiles")
        .upsert(row, { onConflict: "provider_user_id" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
